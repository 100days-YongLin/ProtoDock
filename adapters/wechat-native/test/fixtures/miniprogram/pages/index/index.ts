export default Page({
  data: {
    message: '适配前'
  },
  changeMessage() {
    this.setData({ message: '适配成功' });
  }
});
