(function () {
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  onReady(function () {
    try {
      var form = document.getElementById('smartsearch-bulk-form');
      if (!form) {
        return;
      }

      var actionSelect = form.querySelector('.smartsearch-bulk-action');
      var assignTarget = form.querySelector('.smartsearch-bulk-target-assign');
      var statusTarget = form.querySelector('.smartsearch-bulk-target-status');
      var noteTarget = form.querySelector('.smartsearch-bulk-target-note');
      var checkAll = form.querySelector('.smartsearch-check-all');
      var countNode = form.querySelector('.smartsearch-bulk-count');
      var submitButton = form.querySelector('.smartsearch-bulk-submit');
      var countTemplate = form.getAttribute('data-count-template') || '__COUNT__ selected';

      function rowChecks() {
        return form.querySelectorAll('.smartsearch-row-check:not(:disabled)');
      }

      function setTarget(target, show) {
        if (!target) {
          return;
        }
        target.disabled = !show;
        target.style.display = show ? 'inline-block' : 'none';
      }

      function trimValue(value) {
        return String(value || '').replace(/^\s+|\s+$/g, '');
      }

      function selectedCount() {
        var checks = rowChecks();
        var count = 0;
        for (var i = 0; i < checks.length; i++) {
          if (checks[i].checked) {
            count++;
          }
        }
        return count;
      }

      function syncState() {
        var checks = rowChecks();
        var count = selectedCount();
        var action = actionSelect ? (actionSelect.value || '') : '';

        if (countNode) {
          countNode.textContent = countTemplate.replace('__COUNT__', String(count));
        }
        if (checkAll) {
          checkAll.checked = checks.length > 0 && count === checks.length;
          checkAll.indeterminate = count > 0 && count < checks.length;
        }
        if (submitButton) {
          submitButton.disabled = !(count > 0 && action);
        }
      }

      function syncTargets(focusTarget) {
        var value = actionSelect ? (actionSelect.value || '') : '';
        var targetToFocus = null;

        setTarget(assignTarget, value === 'assign');
        setTarget(statusTarget, value === 'status');
        setTarget(noteTarget, value === 'note');

        if (value === 'assign') {
          targetToFocus = assignTarget;
        } else if (value === 'status') {
          targetToFocus = statusTarget;
        } else if (value === 'note') {
          targetToFocus = noteTarget;
        }

        syncState();

        if (focusTarget && targetToFocus && typeof targetToFocus.focus === 'function') {
          window.setTimeout(function () {
            targetToFocus.focus();
          }, 0);
        }
      }

      if (actionSelect) {
        actionSelect.addEventListener('change', function () {
          syncTargets(true);
        });
      }

      if (checkAll) {
        checkAll.addEventListener('change', function () {
          var checks = rowChecks();
          for (var i = 0; i < checks.length; i++) {
            checks[i].checked = checkAll.checked;
          }
          syncState();
        });
      }

      form.addEventListener('change', function (event) {
        var target = event && event.target ? event.target : null;
        if (target && target.className && String(target.className).indexOf('smartsearch-row-check') !== -1) {
          syncState();
        }
      });

      form.addEventListener('submit', function (event) {
        var action = actionSelect ? (actionSelect.value || '') : '';
        var message = '';

        if (selectedCount() < 1) {
          message = form.getAttribute('data-select-one-message') || 'Select at least one conversation.';
        } else if (!action) {
          message = form.getAttribute('data-action-message') || 'Choose a bulk action.';
        } else if (action === 'assign' && assignTarget && assignTarget.value === '0') {
          message = form.getAttribute('data-assignee-message') || 'Choose an assignee.';
        } else if (action === 'status' && statusTarget && statusTarget.value === '0') {
          message = form.getAttribute('data-status-message') || 'Choose a status.';
        } else if (action === 'note' && noteTarget && !trimValue(noteTarget.value)) {
          message = form.getAttribute('data-note-message') || 'Enter an internal note.';
        }

        if (message) {
          event.preventDefault();
          window.alert(message);
          return;
        }

        form.setAttribute('aria-busy', 'true');
        if (submitButton) {
          submitButton.disabled = true;
          var processingLabel = form.getAttribute('data-processing-label');
          if (processingLabel) {
            submitButton.textContent = processingLabel;
          }
        }
      });

      syncTargets(false);
      syncState();
    } catch (e) {
      // Page-only enhancement; never break navbar search.
    }
  });
})();
