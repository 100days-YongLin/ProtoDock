Component({
  options: {
    styleIsolation: 'apply-shared'
  },
  data: {
    viewportHeight: 0
  },
  pageLifetimes: {
    show() {
      this.createSelectorQuery()
        .selectViewport()
        .boundingClientRect((rect) => this.setData({ viewportHeight: rect.height }))
        .exec();
    }
  }
});
