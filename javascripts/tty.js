(function($) {
  var TTY = {};

  TTY.init = function(jqObj, promptStr, readerFn) {
    TTY.console = jqObj;
    initConsole();

    var $T = function(selector) { return TTY.console.find(selector); }

    TTY.screen = $T('ul');
    TTY.command = $T('span.command');
    TTY.cursor = $T('span.cursor');
    TTY.afterCursor = $T('span.after-cursor');
    TTY.typing = 0;
    TTY.promptStr = promptStr;
    TTY.prompt = $T('span.prompt');
    TTY.prompt.html(escapeHTML(TTY.promptStr));
    TTY.readerFn = readerFn;
    TTY.inputBuffer = "";
    TTY.history = [];
    TTY.historyIdx = -1;
    TTY.commandCache = "";
    setRows();

    function setRows() {
      var rows = parseInt($(window).height() / 20) - 7;
      TTY.rows = (rows > 1) ? rows : 1;
    }

    $(window).resize(function() {
      var oldRows = TTY.rows;
      setRows();
      if (oldRows < TTY.rows)
        TTY.screen.find('li:hidden').slice(oldRows - TTY.rows).show();
      else if (oldRows > TTY.rows)
        TTY.screen.find('li:visible:lt('+(oldRows - TTY.rows)+')').hide();
    });

    blinkCursor(1000);
    captureKeys();

    function initConsole() {
      TTY.console.html(
        '<textarea id="buffer"></textarea>' +
        '<ul>' +
        '  <li class="current">' +
        '    <span class="prompt"></span>' +
        '    <span class="command"></span>' +
        '    <span class="cursor show-cursor">&nbsp;</span>' +
        '    <span class="after-cursor"></span>' +
        '  </li>' +
        '</ul>'
      );
    }

    function blinkCursor(interval) {
      setInterval(function() {
        if (TTY.typing) return;

        TTY.cursor.toggleClass('show-cursor');
      }, interval);
    }

    function captureKeys() {

      function typingEvent(element, eventName, bindingFn) {
        $(element).bind(eventName, function(e) {
          TTY.typing++;
          TTY.cursor.addClass("show-cursor");

          bindingFn(e);

          setTimeout(function() { TTY.typing--; }, 200);
        });
      }

      typingEvent(document, "keypress", function(e) {
        if (e.metaKey) return;

        switch(e.which) {
        case 3: // C-c
          TTY.command.text(TTY.command.text() + "^C");
          TTY.commandCache = "";
          TTY.historyIdx = -1;
          drawNewLine();
          break;
        case 12: // C-l
          setRows();
          $T("li.current").prevAll().hide();
          break;
        case 13: // CR
          moveToEnd();
          consumeLine();
          break;
        case 21: // C-u
          clearLine();
          break;
        case 32: // Space
          TTY.command.html(TTY.command.html() + "&nbsp;");
          break;
        default:
          if (! (e.altKey || e.ctrlKey)) TTY.command.text(TTY.command.text() + String.fromCharCode(e.which));
        }
      });

      $(document).click(function() {
        $T('#buffer').focus();
      }).click();

      typingEvent("#buffer", "keydown", function(e) {
        if (e.metaKey) return;

        switch (e.which) {
        // History back
        case 38:
          if (! (e.ctrlKey || e.altKey))
            historyBack();
          break;

        // History forward
        case 40:
          if (! (e.ctrlKey || e.altKey))
            historyForward();
          break;

        // Backward delete
        case 72: // H
          if (e.ctrlKey)
            deleteBack();
          break;
        case 8: // Backspace
          if (e.ctrlKey || e.altKey)
            deleteBackWord();
          else
            deleteBack();
          break;

        // Forward delete
        case 68: // D
          if (e.ctrlKey)
            deleteForward();
          else if (e.altKey)
            deleteForwardWord();
          break;
        case 46: // DEL
          var text = TTY.afterCursor.text();
          if (text) {
            TTY.cursor.html(escapeHTML(text[0]));
            TTY.afterCursor.html(escapeHTML(text.substr(1, text.length)));
          }
          break;

        // Clear to end
        case 75: // K
          if (! e.ctrlKey) break;
          TTY.cursor.html("&nbsp;");
          TTY.afterCursor.html('');
          break;

        // cursor left
        case 66: // B
          if (e.ctrlKey)
            moveLeft();
          else if (e.altKey)
            moveBackWord();
          break;
        case 37: // Left arrow
          moveLeft();
          break;

        // cursor right
        case 70: // F
          if (e.ctrlKey)
            moveRight();
          else if (e.altKey)
            moveForwardWord();
          break;
        case 39: // Right arrow
          moveRight();
          break;

        // Cursor to beginning
        case 65: // A
          if (! e.ctrlKey) break;
        case 33: // Home
          moveToBeginning();
          break;

        // Cursor to end
        case 69: // E
          if (! e.ctrlKey) break;
        case 34: // End
          moveToEnd();
          break;

        // Swap chars
        case 84: // T
          if (e.ctrlKey)
            swapChars();
          break;
        }
      });
    }

    function escapeHTML(str) {
      return str.replace(/\s/g, "&nbsp;").replace(/>/g, "&gt;").replace(/</g, "&lt;");
    }

    function moveLeft() {
      if (TTY.command.text() == "") return;

      var text = TTY.command.text();
      var afterText = TTY.afterCursor.text();
      TTY.afterCursor.html(escapeHTML(TTY.cursor.text() + afterText));
      TTY.cursor.html(escapeHTML(text[text.length-1]));
      TTY.command.html(escapeHTML(text.substr(0, text.length-1)));
    }

    function matchBack() {
      return TTY.command.text().match(/^(.*)\b(\w+\W*)$/);
    }

    function moveBackWord() {
      var match = matchBack();
      if (! match) return;

      var before = match[1], after = match[2];

      TTY.afterCursor.html(escapeHTML(after.substr(1,after.length)) + TTY.cursor.html() + TTY.afterCursor.html());
      TTY.cursor.html(escapeHTML(after[0]));
      TTY.command.html(escapeHTML(before));
    }

    function deleteBack() {
      var text = TTY.command.text();
      TTY.command.html(escapeHTML(text.substr(0, text.length-1)));
    }

    function deleteBackWord() {
      var match = matchBack();

      if (match)
        TTY.command.html(escapeHTML(match[1]));
    }

    function moveRight() {
      var afterText = TTY.afterCursor.text();
      if (! afterText) return;

      var text = TTY.command.text();

      TTY.command.html(escapeHTML(text + TTY.cursor.text()));
      TTY.cursor.html(escapeHTML(afterText[0]));
      TTY.afterCursor.html(escapeHTML(afterText.substr(1, afterText.length)));
    }

    function matchForward() {
      return TTY.afterCursor.text().match(/^(\W*\w+)\b(.*)$/);
    }

    function moveForwardWord() {
      var match = matchForward();
      if (! match) return;

      var before = match[1], after = match[2];

      TTY.command.html(TTY.command.html() + TTY.cursor.html() + escapeHTML(before));
      TTY.cursor.html(escapeHTML(after[0]));
      TTY.afterCursor.html(escapeHTML(after.substr(1, after.length)));
    }

    function deleteForward() {
      var text = TTY.afterCursor.text();
      if (text) {
        TTY.cursor.html(escapeHTML(text[0]));
        TTY.afterCursor.html(escapeHTML(text.substr(1, text.length)));
      }
    }

    function deleteForwardWord() {
      var match = matchForward();
      if (! match) return;
      var after = match[2];
      TTY.cursor.html(escapeHTML(after[0]));
      TTY.afterCursor.html(escapeHTML(after.substr(1, after.length)));
    }

    function moveToBeginning() {
      var text = TTY.command.text();
      if (! text) return;

      TTY.afterCursor.html(escapeHTML(text.substr(1, text.length)) + TTY.cursor.html() + TTY.afterCursor.html());
      TTY.cursor.html(escapeHTML(text[0]));
      TTY.command.html("");
    }

    function moveToEnd() {
      var afterText = TTY.afterCursor.text();
      if (! afterText) return;

      TTY.command.html(TTY.command.html() + TTY.cursor.html() + escapeHTML(afterText.substr(0, afterText.length-1)));
      TTY.cursor.html(afterText[afterText.length-1]);
      TTY.afterCursor.html('');
    }

    function swapChars() {
      debugger;
      if (TTY.command.text()) {
        moveRight();
      } else if (TTY.afterCursor.text()) {
        moveRight();
        moveRight();
      }
      var command = TTY.command.text();
      var formerChar = command[command.length-2];
      var latterChar = command[command.length-1];

      var newCommand = command.substr(0, command.length-2);
      if (latterChar) newCommand += latterChar;
      if (formerChar) newCommand += formerChar;
      TTY.command.html(escapeHTML(newCommand));
    }

    function cacheLine() {
      moveToEnd();
      TTY.commandCache = TTY.command.text();
    }

    function clearLine() {
      TTY.command.html("");
      TTY.cursor.html("&nbsp;");
      TTY.afterCursor.html("");
    }

    function historyBack() {
      var prevCommand = TTY.history[TTY.historyIdx+1];
      if (prevCommand) {
        if (TTY.historyIdx == -1) cacheLine();
        clearLine();
        TTY.command.html(escapeHTML(prevCommand));
        TTY.historyIdx++;
      }
    }

    function historyForward() {
      var nextCommand = TTY.history[TTY.historyIdx-1];
      if (nextCommand) {
        clearLine();
        TTY.command.html(escapeHTML(nextCommand));
        TTY.historyIdx--;
      } else
        TTY.command.html(escapeHTML(TTY.commandCache));
    }

    function consumeLine() {
      var output = TTY.readerFn(TTY.inputBuffer + TTY.command.text());
      if (output === false) {
        TTY.inputBuffer += TTY.command.text() + "\n";
        var newPrompt = "", i;
        for (i = TTY.promptStr.length-2; i > 0; i--) newPrompt += "&nbsp;";
        drawNewLine(newPrompt+"->");
      } else {
        TTY.history.unshift(TTY.inputBuffer + TTY.command.text());
        TTY.historyIdx = -1;
        TTY.inputBuffer = "";
        TTY.commandCache = "";
        printOutput(output);
        drawNewLine();
      }
    }

    function printOutput(output) { 
      var lines = output.split(/\r?\n/);
      $.each(lines, function(i, line) {
        var newLine = $('<li>');
        newLine.html(escapeHTML(line));
        if (TTY.screen.find('li:visible').length >= TTY.rows)
          TTY.screen.find('li:visible:first').hide();
        TTY.screen.append(newLine);
      });
    }

    function drawNewLine(promptStr) {
      if (promptStr === undefined) promptStr = TTY.promptStr;

      var currentLine = $T("li.current");
      var newLine = currentLine.clone();
      currentLine.removeClass("current");
      currentLine.html(TTY.prompt.html() + "&nbsp;" + escapeHTML(TTY.command.text()));

      newLine.find('.command').html('');
      newLine.find('.after-cursor').html('');
      newLine.find('.cursor').html("&nbsp;").addClass("show-cursor");
      newLine.find('.prompt').html(escapeHTML(promptStr));

      if (TTY.screen.find('li:visible').length >= TTY.rows)
        TTY.screen.find('li:visible:first').hide();

      TTY.screen.append(newLine);

      TTY.command = $T('.command');
      TTY.cursor = $T('.cursor');
      TTY.afterCursor = $T('.after-cursor');
      TTY.prompt = $T('.prompt');
      $T('#buffer').val('');
    }
  }

  $.fn.tty = function(promptStr, readerFn) {
    TTY.init($(this), promptStr, readerFn);
  }
})(jQuery);
