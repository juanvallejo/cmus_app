<!doctype html>
<html>
<head>
    <title>cmus on {{host}}</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" type="text/css" href="/static/kube.min.css"/>
    <link rel="stylesheet" type="text/css" href="/static/font-awesome.min.css"/>
    <style type="text/css">
        .wrapper {
            width: 940px;
            margin: 0 auto;
            padding: 2em;
        }
        .controls {
            font-size: 2.2em;
            padding: 1ex 0;
        }

        .searchbar-input {
            padding:8px; box-shadow:0; border:1px solid #ccc; min-width:290px; font:inherit; font-size:0.5em;
        }

        .active-row {
            background:rgb(38,38,38); color:white;
        }

        @media only screen and (min-width: 768px) and (max-width: 959px) {
            .wrapper { width: 728px; }
        }
        @media only screen and (min-width: 480px) and (max-width: 767px) {
            .wrapper { width: 420px; }
            .controls { font-size: 1.4em; }
        }
        @media only screen and (max-width: 479px) {
            .wrapper { width: 300px; }
            .controls { font-size: 1em; }
        }
        #status {
            overflow: hidden;
            position: relative;
            min-height: 2em;
            padding: 1ex 0;
            background-color: #f5f5f5;
            border: 1px solid #e3e3e3;
            -webkit-border-radius: 1ex;
            -moz-border-radius: 1ex;
            border-radius: 1ex;
            -webkit-box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05);
            -moz-box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05);
            box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05);
        }
        #status p {
            display: inline-block;
            margin: 0 1em;
            line-height: 1em;
            padding: .5em 0 .5em 0;
        }
        .vol {
            position: absolute;
            bottom: 0;
            right: 1ex;
            font-size: .67em;
        }
        #result {
            min-height: 2em;
        }
        footer { position: fixed; bottom: 1ex; }
    </style>
</head>
<body>
<div class="wrapper">

<div id="status"></div>

<div class="controls">

    <span class="btn-group">
        <button class="cmd-btn btn" title="Previous"><i class="icon-fast-backward"></i></button>
        <button class="cmd-btn btn" title="Play" id="play-button"><i class="icon-play"></i></button>
        <button class="cmd-btn btn" title="Stop" id="stop-button"><i class="icon-stop"></i></button>
        <button class="cmd-btn btn" title="Next"><i class="icon-fast-forward"></i></button>
    </span>

    <span class="btn-group">
        <button class="cmd-btn btn" title="Mute"><i class="icon-volume-off"></i></button>
        <button class="cmd-btn btn" title="Reduce Volume"><i class="icon-volume-down"></i></button>
        <button class="cmd-btn btn" title="Increase Volume"><i class="icon-volume-up"></i></button>
    </span>

    <button class="status-btn btn btn-round" title="Update Status"><i class="icon-info-sign"></i></button>

</div>

<!-- begin volume slider -->
<div class="controls">
    <span class="btn-group">
        <div class="slider-wrapper">
            <div class="slider-gutter">
                <div class="slider-modal"></div>
            </div>
        </div>
    </span>
</div>
<!-- end volume slider -->

<!-- begin searchbar -->
<div class="controls">
    <span class="btn-group">
        <div class="searchbar-wrapper">
            <div class="searchbar-gutter">
                <input type="search" title="Search"  id="search" incremental class="searchbar-input input-search" placeholder="Search library"/>
            </div>
        </div>
    </span>
</div>
<!-- end search bar -->
<div id="result"></div>

<!-- begin playlist listing -->
<div class="table-container" style="">
    <table style="width:100%;">
        <thead>
            <tr>
                <th>Song Title</th>
                <th>Artist</th>
                <th>Album</th>
            </tr>
        </thead>
        <tbody id="playlist-content">
            <tr>
                <td class="width-50">song name</td>
                <td class="width-25">artist name</td>
                <td class="width-25">album name</td>
            </tr>
        </tbody>
    </table>
</div>
<!-- end playlist listing -->

<footer>
    <p class="small gray-light"><i class="icon-play-circle"></i> This is <code>cmus</code> running on {{host}}.</p>
</footer>

</div>
<script src="/static/zepto.min.js"></script>
<script type="text/javascript">
    // define global variables
    var activeRow                   = null;                         // current row of playlist results being highlighted
    var updateStatusTimeout         = null;                         // timeout interval for updating app status
    var updateStatusTimeoutInterval = 15000;                        // time to wait in between updating app status
    var searchHasFiltered           = false;                        // indicates if there are hidden rows due to search
    var filteredSearchResults       = [];                           // contains results that have been filtered - search
    var playlistDataHasLoaded       = false;                        // indicates if data read from playlist has loaded
    var runOnPlaylistDataLoad       = [];                           // contains callback functions to call once playlist results are read from file

    // define basic app functions
    function postCommand(command, data){
        var playButton = document.getElementById('play-button');
        
        if(command == 'Play') {
            playButton.isPlaying    = true;
            playButton.title        = 'Pause';

            playButton.children[0].className  = 'icon-pause'; 
        } else if(command == 'Pause') {
            playButton.isPlaying    = false;
            playButton.title        = 'Play';

            playButton.children[0].className = 'icon-play';
        }

        $.post('/cmd', {command: command, data:(data || "0")}, function(response){
            
            if (response.result == 0) {var msg = '<p class="green label"><i class="icon-ok"></i> ' + command + '</p>'} 
            else {var msg = '<p class="red label"><i class="icon-remove"></i> ' + command + '</p>'}
            if(command == 'Search') {
                alert(response.output);
            } else {
                if (response.output) msg += '<pre>' + response.output + '</pre>';
            }
            $("div#result").html(msg)
        }, 'json');
    }

    /**
     * fetches updated status from cmus via cmus-remote command.
     * Request is made to python ui server @ http://192.168.1.7:8080
     * 'cmus-remote -Q'
     */
    function updateStatus() {
        // define and reset status interval counter
        clearTimeout(updateStatusTimeout);
        updateStatusTimeout = setTimeout(function() {
            updateStatus()
        }, updateStatusTimeoutInterval);
       
       // make status request to server
        $.ajax({url: '/status', dataType: 'json', context: $("div#status"), success: function(response){
            var status = '<p>';
            var playButton = document.getElementById('play-button');
            var playlistContentWrapper = document.getElementById('playlist-content');

            if (response.playing == true) {
                status = '<p>'
                
                if(!playButton.hasStarted) {
                    playButton.isPlaying = true;
                    playButton.children[0].className = 'icon-pause';
                    playButton.title = 'Pause';
                }
            }
            if (response.playing == false) {
                status = '<p class="gray">'
                
                if(!playButton.hasStarted) {
                    playButton.isPlaying = false;
                    playButton.title = 'Play';
                    playButton.children[0].className = 'icon-play';
                }
            }
            
            if(!playButton.hasStarted) {
                playButton.hasStarted = true;
            }

            // update activeRow
            var activeRowDidMatchStatusUpdate = false;
            if(activeRow) {
                if(response.artist == activeRow.dataset.artist && response.title == activeRow.dataset.songTitle) {
                    activeRowDidMatchStatusUpdate = true;
                } else {
                    activeRow.className = '';
                }
            }

            function updateSelectedRow() {
                if(!activeRowDidMatchStatusUpdate) {
                    var songRowWasMatched = false;
                    for(var i = 0; i < playlistContentWrapper.children.length; i++) {
                        var row = playlistContentWrapper.children[i];
                        if(row && row.dataset && row.dataset.artist == response.artist && row.dataset.songTitle == response.title) {
                            activeRow = playlistContentWrapper.children[i];
                            playlistContentWrapper.children[i].className = 'active-row';

                            // end loop
                            songWasMatched = true;
                        }
                    }
                }
            }

            if(playlistDataHasLoaded) {
                updateSelectedRow();
            } else {
                runOnPlaylistDataLoad.push(updateSelectedRow);
            }

            if (response.artist != null & response.title != null & response.album != null & response.date != null)
                {status += response.artist + ': <strong>' + response.title + '</strong> (' + response.album + ', ' + response.date.substring(0,4) + ')'}
            else if (response.artist != null & response.title != null & response.album != null)
                {status += response.artist + ': <strong>' + response.title + '</strong> (' + response.album + ')'}
            else if (response.artist != null & response.title != null & response.date != null)
                {status += response.artist + ': <strong>' + response.title + '</strong> (' + response.date.substring(0,4) + ')'}
            else if (response.artist != null & response.title != null)
                {status += response.artist + ': <strong>' + response.title + '</strong>'}
            else if (response.title != null)
                {status += '<strong>' + response.title + '</strong>'}
            else if (response.artist != null)
                {status += response.artist + ': <strong>(unknown)</strong>'}
            else {status += '<em>none/unknown</em>'}
            status += '</p><span class="vol gray">';
            if (response.vol_left != null) {status += response.vol_left}
            if (response.shuffle == 'true') {status += ' <i class="icon-random"></i>'}
            if (response.repeat == 'true') {status += ' <i class="icon-refresh"></i>'}
            status += '</span>';
            this.html(status)
        }})
    }
    
    /**
     * make an XMLHttpRequest to specified address
     * @requestURL  {String}    address to make request
     * @callback    {Function}  to call once request is made
     */
    function getHTTPRequest(requestURL, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', requestURL, true);
        xhr.send(null);
        xhr.addEventListener('readystatechange', function() {
            // return params for callback functions are in format
            // (context, errorString (Sring | Null), responseText (String))
            if(this.status == 200 && this.readyState == 4) {
                   // return success call with null error param
                   callback.call(this, null, this.responseText);
            } else if(this.readyState == 4) {
                // inform of error
                callback.call(this, this.responseText, "");
            }
        });
    }
 
    /**
     * make request to fetch playlist information
     */
    function updatePlaylistListing() {
        getHTTPRequest('/get_playlist_data', function(err, response) {
            if(err) {
                return console.log('Error retrieving playlist data -> ' + err);
            }

            var playlistContentWrapper   = document.getElementById('playlist-content');
            var playlistContent         = response.split('file');
           
           // remove first empty string result from array of results
            playlistContent.splice(0,1); 

            // reset playlist contents before fetching updated content
            playlistContentWrapper.innerHTML = ''; 

            // append playlist contents to table body
            playlistContent.forEach(function(playlistString) {
                var rawSongData = playlistString.split('\n');
                
                var filename    = rawSongData[0].substring(1);
                var title       = rawSongData[4].split('tag title ')[1] || rawSongData[3].split('tag title ')[1] || rawSongData[8].split('tag title ')[1] || rawSongData[7].split('tag title ')[1] || rawSongData[5].split('tag title ')[1] || rawSongData[10].split('tag title')[1] || rawSongData[6].split('tag title ')[1];
                var artist      = rawSongData[5].split('tag artist ')[1] || rawSongData[4].split('tag artist ')[1] || rawSongData[6].split('tag artist ')[1] || rawSongData[7].split('tag artist')[1] || rawSongData[11].split('tag artist ')[1];
                var album       = rawSongData[4].split('tag album ')[1] || rawSongData[6].split('tag album ')[1] || rawSongData[7].split('tag album ')[1];
               
               // cleanup data
               title    = title.trim();
               artist   = artist.trim();
               album    = album.trim();
                
                var tableRow        = document.createElement('tr');
                var tableCellTitle  = document.createElement('td');
                var tableCellArtist = document.createElement('td');
                var tableCellAlbum  = document.createElement('td');

                tableRow.dataset.filename  = filename;
                tableRow.dataset.songTitle = title;
                tableRow.dataset.artist    = artist;
                tableRow.dataset.album     = album;
                
                // add html content to each table cell for row
                tableCellTitle.innerHTML    = title; 
                tableCellArtist.innerHTML   = artist;
                tableCellAlbum.innerHTML    = album;

                // append table cells to row
                tableRow.appendChild(tableCellTitle);
                tableRow.appendChild(tableCellArtist);
                tableRow.appendChild(tableCellAlbum);
                
                playlistContentWrapper.appendChild(tableRow);
                
                // add click event listener to row
                tableRow.addEventListener('click', function() {
                    // send command to play song to server
                    postCommand('Filter', 'artist="' + this.dataset.artist + '"&title="' + this.dataset.songTitle + '"'); 
                    
                    // remove selection from row if any is selected
                    if(activeRow) {
                        activeRow.className = "";
                    }

                    // assign pointer to current row
                    activeRow = this;
                    this.className = "active-row";
                });
            });

            // update environment load vars
            playlistDataHasLoaded = true;
            runOnPlaylistDataLoad.forEach(function(callback) {
                callback.call();
            });

            updateStatus();
        });
    }

    $(".status-btn").on('click', (function() {
        updateStatus();
    }))
    
    document.getElementById('stop-button').addEventListener('click', function() {
        var playButton = document.getElementById('play-button');

        playButton.title        = 'Play';
        playButton.isPlaying    = false;
        playButton.children[0].className = 'icon-play';
    });

    $(".cmd-btn").on('click', (function(){
        var cmd = $(this).attr('title');
        var data = $(this).data('cmddata');
        postCommand(cmd, data);
        updateStatus();
    }))

    $('.searchbar-input').on('search', function() {
        if(this.value == '' && searchHasFiltered) {
            searchHasFiltered = false;

            filteredSearchResults.forEach(function(row) {
                row.style.display = '';
            });

            filteredSearchResults = [];
        }
    });

    $('.searchbar-input').on('keypress', function(e) {
        if(e.keyCode == 13) {
            e.preventDefault();
            
            // check to see if input is empty
            if(this.value == '') {
                return false;
            }
                
            var playlistContentWrapper  = document.getElementById('playlist-content');
            var searchBarElement        = document.getElementById('search');
            var data                    = this.value.toLowerCase();

            if(searchHasFiltered) {
                searchHasFiltered = false;

                filteredSearchResults.forEach(function(row) {
                    row.style.display = '';
                });

                // reset list of filtered search results
                filteredSearchResults = [];
            }
            
            for(var i = 0; i < playlistContentWrapper.children.length; i++) {
                var row     = playlistContentWrapper.children[i];  

                if(row.dataset.songTitle.toLowerCase().indexOf(data) == -1 && row.dataset.artist.toLowerCase().indexOf(data) == -1 && row.dataset.album.toLowerCase().indexOf(data) == -1) {
                    row.style.display = 'none';

                    if(!searchHasFiltered) {
                        searchHasFiltered = true;
                    }

                    filteredSearchResults.push(row);
                }
            }
        }
    });

    $("div#result").on('click', (function(){
        $(this).empty()
    }))

    /**
     * Main app function
     * Provides init calls for the app
     */
    Zepto(function() {
       // fetch current data from media server 
        updateStatus()

        // fetch and populate playlist contents
        updatePlaylistListing();
    })
</script>
</body>
</html>
