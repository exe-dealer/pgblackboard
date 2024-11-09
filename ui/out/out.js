import xGrip from '../grip/grip.js';

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
  _render_table(frame, frame_idx) {
    const { selected_frame_idx, selected_row_idx } = this.$store.out;
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
              tag: 'col',
              class: 'out-col',
              style: { width: col.width + 'px' },
              'data-selected': col_is_selected(col_idx) || null,
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
              { tag: 'th', class: 'out-th_rowh', scope: 'col', innerHTML: '#' },
              frame.cols.map((col, col_idx) => ({
                tag: 'th',
                class: 'out-th',
                'data-key': col.att_key || null,
                'data-selected': col_is_selected(col_idx) || null,
                scope: 'col',
                inner: [
                  // TODO support \n, leading/tailing whitespace in colname
                  { tag: 'span', class: 'out-colh_name', inner: col.name },
                  ' ',
                  { tag: 'span', class: 'out-colh_type', inner: col.type },
                  {
                    tag: xGrip,
                    class: 'out-colh_resizer',
                    x: col.width,
                    onDrag: e => this.resize_col(frame_idx, col_idx, e.x),
                  },
                ],
              })), // th
              { tag: 'th', class: 'out-th', scope: 'col' },
            ],
          }], // tr
        }, // thead

        {
          tag: 'tbody',
          class: 'out-tbody',
          onClick: e => this.on_tbody_click(e, frame_idx),
          onMousedown: this.on_tbody_mousedown,
          inner: frame.rows.map((row, row_idx) => this._render_row({
            frame_idx,
            row_idx,
            row,
            selected_col_idx: frame.selected_col_idx,
            cols: frame.cols,
            can_update,
          })),
        },

        can_insert && {
          tag: 'tfoot',
          class: 'out-tbody',
          onClick: e => this.on_tbody_click(e, frame_idx),
          onMousedown: this.on_tbody_mousedown,
          inner: {
            tag: 'tr',
            class: 'out-row out-row--new',
            'data-selected': row_is_selected(frame.rows.length) || null,
            'data-row_idx': frame.rows.length,
            inner: [
              { tag: 'th', 'class': 'out-th_rowh', scope: 'row', innerHTML: '*' },
              frame.cols.map((_col, col_idx) => ({
                tag: 'td',
                class: 'out-cell',
                'data-selected': cell_is_selected(frame.rows.length, col_idx) || null,
                'data-col_idx': col_idx,
                'data-unset': true,
              })),
              {
                tag: 'td',
                class: 'out-td_last',
              },
            ],
          }, // tr.out-row--new
        }, // tbody
      ],
    }; // table

    function col_is_selected(col_idx) {
      return (
        selected_frame_idx == frame_idx &&
        frame.selected_col_idx == col_idx
      );
    }
    function row_is_selected(row_idx) {
      return (
        selected_frame_idx == frame_idx &&
        selected_row_idx == row_idx
      );
    }
    function cell_is_selected(row_idx, col_idx) {
      return (
        row_is_selected(row_idx) &&
        col_is_selected(col_idx)
      );
    }
  },

  // need to iterate over all modifications without full scan over unchanged rows
  // need ability to delete inserted row - row_idx should be stable
  // row_idx should be incrementable to for keyboard table navigation

  _render_row({ frame_idx, row_idx, row, cols, selected_col_idx, can_update }) {
    const { selected_frame_idx, selected_row_idx } = this.$store.out;

    const row_is_selected = (
      selected_frame_idx == frame_idx &&
      selected_row_idx == row_idx
    );

    const is_dirty = Boolean(row.modified);
    const will_delete = Boolean(row.modified?.delete);

    return {
      tag: 'tr',
      class: 'out-row',
      'data-will_delete': will_delete || null,
      'data-selected': row_is_selected || null,
      'data-row_idx': row_idx,
      inner: [
        {
          tag: 'th',
          class: 'out-th_rowh',
          scope: 'row',
          inner: row_idx + 1,
        },
        cols.map((_col, col_idx) => ({
          tag: xTd,
          class: 'out-cell',
          'data-selected': row_is_selected && selected_col_idx == col_idx || null,
          'data-col_idx': col_idx,
          value: {
            original: row.original?.[col_idx],
            // move .modified dependency to cell component
            // to avoid full table rerender on cell editing
            get modified() {
              return row.modified?.[col_idx];
            },
          },
        })), // xTd
        {
          tag: 'td',
          class: 'out-td_last',
          inner: !can_update ? null : [
            {
              tag: 'button',
              class: 'out-delete_row',
              type: 'button',
              disabled: is_dirty,
              'aria-label': 'Delete row',
            },
            {
              tag: 'button',
              class: 'out-revert_row',
              type: 'button',
              disabled: !is_dirty,
              'aria-label': 'Revert row',
            },
          ],
        }, // td.out-td_last
      ],
    }; // tr.out-row
  },
  _mounted() {
    // TODO unlisten
    this.$root.$el.addEventListener('req_row_focus', this.on_row_navigate);
  },
  resize_col(frame_idx, col_idx, width) {
    this.$store.resize_col(frame_idx, col_idx, Math.max(width, 50));
  },
  on_tbody_click(/** @type {MouseEvent} */ e, frame_idx) {
    const { target } = e;
    const tr = target.closest('[data-row_idx]');
    if (!tr) return;
    const row_idx = Number(tr.dataset.row_idx);

    if (target.matches('.out-delete_row')) {
      return this.$store.delete_row(frame_idx, row_idx);
    }

    if (target.matches('.out-revert_row')) {
      return this.$store.revert_row(frame_idx, row_idx);
    }

    const col_idx = Number(target.closest('[data-col_idx]')?.dataset?.col_idx);
    this.$store.set_selected_rowcol(frame_idx, row_idx, col_idx);
    this.$root.$el.dispatchEvent(new CustomEvent('req_map_navigate', { detail: { frame_idx, row_idx, origin: 'sheet' } }));

    if (e.detail == 2 && Number.isInteger(col_idx)) {
      this.$root.$el.dispatchEvent(new CustomEvent('req_datum_focus'));
    }
  },
  on_tbody_mousedown(e) {
    if (e.detail > 1) {
      e.preventDefault();
    }
  },
  on_row_navigate({ detail: { frame_idx, row_idx } }) {
    // TODO get selected_frame_idx, selected_row_idx from store
    const tr = this.$el.querySelector(`[data-frame_idx="${frame_idx}"] tr[data-row_idx="${row_idx}"]`);
    tr.scrollIntoView({ block: 'center' });
  },
};

export default {
  methods,
  // renderTriggered() { console.time('out rendering'); },
  // updated() { console.timeEnd('out rendering'); }
};

const xTd = {
  props: {
    value: Object,
  },
  methods: {
    _render() {
      const { original, modified } = this.value;
      // TODO dry display_value computation logic (datum editor)
      const value = modified === undefined ? original : modified;
      return {
        tag: 'td',
        'data-null': value === null || null,
        'data-unset': value === undefined || null,
        'data-dirty': modified !== undefined || null,
        inner: render_cell_value(value),
      };
    },
  },
};

function render_cell_value(value) {
  if (!value) return null;
  const nodes = [];
  const sample = value.slice(0, 256);
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
}
