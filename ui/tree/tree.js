const methods = {
  _render() {
    const nodes = this.nodes || this.$store.tree.children?.value;

    return {
      tag: 'div',
      class: 'tree',
      style: { '--tree-level': this.path.length + 1 },
      inner: nodes.map(this._render_branch, this),
    };
  },
  _render_branch(node, node_idx) {
    const node_path = this.path.concat(node_idx);
    const node_is_selected = JSON.stringify(this.$store.curr_treenode_path) == JSON.stringify(node_path);

    return {
      tag: 'div',
      class: 'tree-branch',
      inner: [
        {
          tag: 'div',
          class: 'tree-node',
          'data-type': node.type,
          'data-selected': node_is_selected || null,
          'data-expanding': node.children?.loading || null,
          'data-expanded': node.children && !node.children.loading || null,
          onClick: _ => this.select(node_path),
          inner: [
            {
              tag: 'span',
              class: 'tree-marker',
              // TODO aria
            },
            {
              tag: 'span',
              class: 'tree-caption',
              inner: [
                node.name,
                ' ',
                { tag: 'span', class: 'tree-comment', inner: node.comment },
              ],
            },
            node.badge && {
              tag: 'span',
              class: 'tree-badge',
              inner: node.badge,
            },
            {
              tag: 'span',
              class: 'tree-loader',
            },
            node.expandable && {
              tag: 'button',
              class: 'tree-toggler',
              onClick: e => (e.stopPropagation(), this.toggle(node_path)),
            },
          ],
        },
        node.children?.error && {
          tag: 'div',
          class: 'tree-error',
          inner: node.children.error,
        },
        node.children?.value && {
          tag: xTree,
          class: 'tree-children',
          nodes: node.children.value,
          path: node_path,
        },
      ],
    };
  },
  toggle(node_path) {
    this.$store.tree_toggle(node_path);
  },
  select(node_path) {
    this.$store.tree_select(node_path);
  },
};

const xTree = {
  props: {
    nodes: Array,
    path: { default: [] },
  },
  methods,
};

export default xTree;
