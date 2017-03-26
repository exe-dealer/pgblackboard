define(function (require, exports, module) {
  'use strict';
  const el = require('../core/el')
  const dispatch = require('../core/dispatch')
  const renderTable = require('./table')
  const render_queryplan = require('./queryplan')
  const render_map = require('map/renderMap')
  const saveChanges = require('../actions/table_save_changes');

  module.exports = renderExecOutput;

  function renderExecOutput(execOutput) {
    if (!execOutput.items) {
      return null;
    }

    return {
      key: execOutput.useMap ? 'map' : 'sheet',
      children: execOutput.useMap ? render_map(execOutput) : renderSheet(execOutput)
    };
  }

  function renderSheet(execOutput) {
    return el('div.execOutput'
      ,el('div.execOutput__scrollContainer'
        ,execOutput.items.map(renderStatementResult)
      )

      ,el('div.execOutput__cornerBar'
        ,el('button.execOutput__saveChanges'
          ,el.on('click', _ => dispatch(saveChanges(execOutput)))
          ,'save changes'
        )
      )

    );
  }

  function renderStatementResult(result, index) {
    return el('div.statementResult'
      ,result.error && el('div.message.message--error'
        ,result.error.message
      )
      ,result.fields && result.fields.length && renderTable({
        rows: result.rows,
        fields: result.fields,
        changes: result.changes,
        rowset_index: index,
        can_update_and_delete: result.source_table &&
          result.source_table.columns.some(col => col.is_key),
        can_insert: result.source_table && result.source_table.columns.every(
          col => col.has_default || !col.is_notnull || Number.isFinite(col.field_index)
        ),
      })
      ,result.commandTag && el('div.message'
        ,result.commandTag
      )
    )
  }



});
