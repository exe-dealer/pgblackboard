import xGrip from '../grip/grip.js';

// TODO virtual scroll

const methods = {
  _render() {
    const { frames } = this.$store.out;
    const datum_focused = this.$store.datum_focused;
    return {
      tag: 'div',
      class: 'out',
      'data-datum_focused': datum_focused || null,
      inner: frames.map(this._render_table, this),
    };
  },
  _render_col({ col }) {
    return {
      tag: 'col',
      style: { width: col.width + 'px' },
    };
  },
  _render_table(frame, frame_idx) {
    const sel = this.$store.get_selected_rowcol();
    const selected_row_idx = sel.frame_idx == frame_idx ? sel.row_idx : null;
    const selected_col_idx = sel.frame_idx == frame_idx ? sel.col_idx : null;
    const can_insert = Boolean(frame.rel_name);
    const can_update = frame.cols.some(col => col.att_key);

    return {
      tag: 'table',
      class: 'out-table',
      'data-frame_idx': frame_idx,
      inner: [
        {
          tag: 'colgroup',
          inner: [
            { tag: 'col', class: 'out-col_rowh' },
            frame.cols.map((col, col_idx) => ({
              tag: xHot,
              inner: this._render_col,
              arg: { col },
              class: 'out-col',
              'data-selected': selected_col_idx == col_idx || null,
            })),
            { tag: 'col', class: 'out-col out-col_last' },
          ],
        }, // colgroup

        {
          tag: 'thead',
          class: 'out-thead',
          inner: [{
            tag: 'tr',
            inner: [
              { tag: 'th', class: 'out-rowh', scope: 'col', innerHTML: '#' },
              frame.cols.map((col, col_idx) => ({
                tag: 'th',
                class: 'out-colh',
                'data-key': col.att_key || null,
                'data-selected': selected_col_idx == col_idx || null,
                scope: 'col',
                inner: [
                  // TODO support \n, leading/tailing whitespace in colname
                  { tag: 'span', class: 'out-colname', inner: col.name },
                  ' ',
                  { tag: 'span', class: 'out-coltype', inner: col.type },
                  {
                    tag: xGrip,
                    class: 'out-colsizer',
                    onDrag: this.on_colsizer_drag,
                    origin: {
                      frame_idx,
                      col_idx,
                      get width() { return col.width; },
                    },
                  },
                ],
              })), // th
              { tag: 'th', class: 'out-colh', scope: 'col' },
            ],
          }], // tr
        }, // thead

        {
          tag: 'tbody',
          class: 'out-tbody',
          onFocusin: this.on_focusin,
          onKeydown: this.on_keydown,
          onKeyup: this.on_keyup,
          onClick: this.on_click,
          onMousedown: this.on_mousedown,
          inner: [
            frame.rows.map((row, row_idx) => this._render_row({
              row_idx,
              original: row.original,
              modified: row.modified,

              cols: frame.cols,
              can_update,
              selected_row_idx,
              selected_col_idx,
            })),
            can_insert && this._render_row({
              row_idx: frame.rows.length,

              cols: frame.cols,
              // can_update,
              selected_row_idx,
              selected_col_idx,
            }),
          ],
        },
      ],
    }; // table
  },

  // need to iterate over all modifications without full scan over unchanged rows
  // need ability to delete inserted row - row_idx should be stable
  // row_idx should be incrementable to for keyboard table navigation

  _render_row({
    original,
    modified,
    row_idx,

    cols,
    selected_row_idx,
    selected_col_idx,
    can_update,
  }) {

    const is_selected = selected_row_idx == row_idx;
    const is_new = !original && !modified;

    const dirty = (
      !modified ? null :
      modified.delete ? 'delete' :
      !original ? 'insert' :
      'update'
    );

    return {
      tag: 'tr',
      class: 'out-row', // TODO is_new
      'data-dirty': dirty,
      // 'aria-rowindex': row_idx + 1,
      'aria-selected': is_selected,
      inner: [
        {
          tag: 'th',
          class: 'out-rowh',
          scope: 'row',
          inner: is_new ? '*' : row_idx + 1,
        },
        cols.map((_col, col_idx) => ({
          // move .modified[n] dependency to cell component
          // to avoid full table rerender on cell editing
          tag: xHot,
          class: 'out-cell',
          tabindex: 0,
          'aria-selected': is_selected && selected_col_idx == col_idx || null,
          // 'aria-colindex': col_idx + 1,
          inner: this._render_cell,
          arg: { original, modified, col_idx },
        })),
        {
          tag: 'td',
          class: 'out-td_last',
          inner: !can_update ? null : [
            {
              tag: 'button',
              class: 'out-delete_row',
              type: 'button',
              tabindex: -1,
              disabled: !!dirty,
              'aria-label': 'Delete row',
            },
            {
              tag: 'button',
              class: 'out-revert_row',
              type: 'button',
              tabindex: -1,
              disabled: !dirty,
              'aria-label': 'Revert row',
            },
          ],
        }, // td.out-td_last
      ],
    }; // tr.out-row
  },
  _render_cell({ original, modified, col_idx }) {
    // TODO dry display_value computation logic (datum editor)
    const oval = original?.[col_idx];
    const mval = modified?.[col_idx];
    const val = mval === undefined ? oval : mval;
    return {
      tag: 'td',
      'data-null': val === null || null,
      'data-unset': val === undefined || null,
      'data-dirty': mval !== undefined || null,
      inner: this._render_cell_value(val),
    };
  },
  _render_cell_value(value) {
    if (!value) return null;
    const nodes = [];
    const sample = value.slice(0, 100);
    for (const { 0: token } of sample.matchAll(/\n|\r|.+/yg)) {
      nodes.push(
        token == '\n' ? { tag: 'em', innerHTML: '\\n' } :
        token == '\r' ? { tag: 'em', innerHTML: '\\r' } :
        token
      );
    }
    if (sample.length < value.length) { // overflow
      nodes.push({ tag: 'em', innerHTML: '&mldr;' });
    }
    return nodes;
  },

  _mounted() {
    this.$root.$el.addEventListener('req_row_navigate', this.on_req_row_navigate);
    this.$root.$el.addEventListener('req_cell_focus', this.on_req_cell_focus);
  },
  _unmounted() {
    this.$root.$el.removeEventListener('req_row_navigate', this.on_req_row_navigate);
    this.$root.$el.removeEventListener('req_cell_focus', this.on_req_cell_focus);
  },
  on_colsizer_drag(e) {
    const { frame_idx, col_idx, width } = e.origin;
    const clipped_width = Math.max(width + e.x, 50);
    this.$store.resize_col(frame_idx, col_idx, clipped_width);
  },
  on_focusin({ target }) {
    const table_el = target.closest('table[data-frame_idx]');
    const tr = target.closest('tr');
    const td = target.closest('td');
    if (!td) return;
    // TODO dry
    const frame_idx = +table_el.getAttribute('data-frame_idx');
    const row_idx = tr.rowIndex - 1;
    const col_idx = td.cellIndex - 1;

    this.$store.set_selected_rowcol(frame_idx, row_idx, col_idx);
    this.$root.$el.dispatchEvent(new CustomEvent('req_map_navigate'));
  },
  on_click(/** @type {MouseEvent} */ e) {
    const { target } = e;

    if (target.matches('button.out-delete_row')) {
      // TODO dry
      const frame_idx = +target.closest('table').getAttribute('data-frame_idx');
      const row_idx = target.closest('tr').rowIndex - 1;
      this.$store.delete_row(frame_idx, row_idx);
      return;
    }

    if (target.matches('button.out-revert_row')) {
      // TODO dry
      const frame_idx = +target.closest('table').getAttribute('data-frame_idx');
      const row_idx = target.closest('tr').rowIndex - 1;
      this.$store.revert_row(frame_idx, row_idx);
      return;
    }
  },
  on_mousedown(/** @type {MouseEvent} */ e) {
    // focus datum editor on cell double click
    if (e.detail > 1 && e.target.matches('.out-cell')) {
      e.preventDefault(); // prevent text selection on double click
      this.$root.$el.dispatchEvent(new CustomEvent('req_datum_focus'));
    }
  },
  on_keyup(/** @type {KeyboardEvent} */e) {
    if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
    // We going to focus datum editor on key Enter.
    // Do it on keyup to prevent editor receive Enter
    // when key hold enough time to cause keydown event repeat.
    if (e.code == 'Enter') {
      this.$root.$el.dispatchEvent(new CustomEvent('req_datum_focus'));
      e.preventDefault();
    }
  },
  on_keydown(/** @type {KeyboardEvent} */ e) {
    if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;

    const td = this.$el.ownerDocument.activeElement;
    if (!td?.matches('td')) return;

    const new_td = (
      e.code == 'ArrowLeft' ? td.previousElementSibling :
      e.code == 'ArrowRight' ? td.nextElementSibling :
      e.code == 'ArrowUp' ? td.parentElement.previousElementSibling?.cells?.[td.cellIndex] :
      e.code == 'ArrowDown' ? td.parentElement.nextElementSibling?.cells?.[td.cellIndex] :
      null
    );

    if (new_td) { // TODO check if focusable
      new_td.focus();
      e.preventDefault();
    }
  },

  on_req_row_navigate() {
    const { frame_idx, row_idx } = this.$store.get_selected_rowcol();
    const tr = this.$el.querySelector(`
      .out-table[data-frame_idx="${frame_idx}"]
      .out-row:nth-child(${row_idx + 1})
    `);
    tr?.scrollIntoView({ block: 'center' });
  },
  on_req_cell_focus() { // handle datum Escape
    const { frame_idx, row_idx, col_idx } = this.$store.get_selected_rowcol();
    const td = this.$el.querySelector(`
      .out-table[data-frame_idx="${frame_idx}"]
      .out-row:nth-child(${row_idx + 1})
      .out-cell:nth-of-type(${col_idx + 1})
    `);
    // TODO do not req_map_navigate
    // do not set_selected_rowcol
    td?.focus();
  },
};

const xHot = {
  props: ['arg'],
  methods: {
    _render() {
      const vnodes = this.$slots.default(this.arg);
      return vnodes.length == 1 ? vnodes[0] : vnodes;
    },
  },
};

export default {
  methods,
  // renderTriggered() { console.time('out rendering'); },
  // updated() { console.timeEnd('out rendering'); }
};
