const methods = {
  _render() {
    return {
      tag: 'span',
      onPointerdown: this.on_pointerdown,
      onLostpointercapture: this.on_lostpointercapture,
    };
  },
  /** @param {MouseEvent} e */
  on_pointerdown(e) {
    if (e.button != 0) return; // left button only
    this.start_x = e.clientX;
    this.start_y = e.clientY;
    this._origin = { ...this.origin };
    this.$el.setPointerCapture(e.pointerId);
    this.$el.addEventListener('pointermove', this.on_pointermove);
    // TODO :active selector not works in firefox
    e.preventDefault(); // disable text selection in safari and firefox
  },
  on_lostpointercapture(e) {
    this.$el.removeEventListener('pointermove', this.on_pointermove);
    // TODO fix в safari e.clientX e.clientY установлены в 0
    this.on_pointermove(e, true);
  },
  on_pointermove({ clientX, clientY }, done = false) {
    this.$emit('drag', {
      done,
      origin: this._origin,
      x: clientX - this.start_x,
      y: clientY - this.start_y,
    });
  },
};

export default {
  methods,
  props: {
    origin: Object,
  },
};
