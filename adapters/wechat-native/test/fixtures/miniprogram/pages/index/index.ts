export default Page({
  data: {
    message: '适配前',
    sliderEvents: ''
  },
  sliderChanging(event) {
    this.setData({ sliderEvents: this.data.sliderEvents + 'changing:' + event.detail.value + ';' });
  },
  sliderChanged(event) {
    this.setData({ sliderEvents: this.data.sliderEvents + 'change:' + event.detail.value + ';' });
  },
  changeMessage() {
    this.setData({ message: '适配成功' });
  }
});
