// TODO keyboard navigation
// https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/treeitem_role#keyboard_interactions

export default {
  methods: {
    _render() {
      return {
        tag: xTree,
        path: [],
        content: this.$store.tree.children,
      };
    },
  },
};

const xTree = {
  props: {
    path: Array,
    content: Object,
  },
  methods: {
    _render() {
      const { path, content } = this;
      return {
        tag: 'ul',
        class: 'tree',
        role: 'tree',
        ... path.length && { role: 'group' },
        style: { '--tree-level': path.length },
        inner: [
          content.nodes.map(this._render_item, this),
          content.error && {
            tag: 'li',
            class: 'tree-item',
            // TODO role treeitem ?
            inner: {
              tag: 'span',
              class: 'tree-error',
              inner: content.error,
            }
          },
        ],
      };
    },
    _render_item(node, node_idx) {
      return {
        tag: xTreeItem,
        // TODO does new array cause component recreation?
        path: [...this.path, node_idx],
        node,
      };
    },
  },
};

const xTreeItem = {
  props: {
    path: Array,
    node: Object,
  },
  methods: {
    _render() {
      const { node, path } = this;
      const node_is_selected = JSON.stringify(this.$store.selected_treenode_path) == JSON.stringify(path);
      // TODO dup type into mod on server side? or split dom attributes?
      const type_and_mod = [node.ntype, node.mod].filter(Boolean).join(' ');
      return {
        tag: 'li',
        class: 'tree-item',
        role: 'treeitem',
        'aria-selected': node_is_selected,
        ... !node.leaf && {
          'aria-expanded': Boolean(node.children.ready),
        },
        inner: [
          {
            tag: 'a',
            class: 'tree-link',
            'data-type': type_and_mod,
            ... node_is_selected && { 'data-selected': true },
            onClick: this.select,
            inner: [
              {
                tag: 'span',
                class: 'tree-marker',
                role: 'img',
                'aria-label': type_and_mod, // TODO noisy machine label
              },
              node.size > 0 && {
                tag: 'span',
                class: 'tree-badge',
                inner: Number(node.size).toLocaleString('en', { notation: 'compact' }),
              },
              ' ',
              {
                tag: 'span', // TODO dfn?
                class: 'tree-name',
                inner: node.name,
              },
              ' ',
              node.descr && {
                tag: 'span',
                class: 'tree-descr',
                inner: node.descr,
              },
            ],
          },
          !node.leaf && {
            tag: 'button',
            class: 'tree-toggler',
            type: 'button',
            disabled: node.children.ready == null,
            'aria-expanded': Boolean(node.children.ready),
            'aria-label': 'Expand/Collapse', // TODO calc?
            onClick: this.toggle,
            // TODO aria-controls
          },
          // TODO should indicate no children?
          node.children.ready && {
            tag: xTree,
            class: 'tree-children',
            path,
            content: node.children,
          },
        ],
      };
    },
    toggle() {
      this.$store.tree_toggle(this.path);
    },
    select() {
      this.$store.tree_select(this.path);
    },
  }
};
