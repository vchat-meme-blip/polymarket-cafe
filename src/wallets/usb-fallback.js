// This is a no-op fallback for the usb module
module.exports = {
  on: () => {},
  off: () => {},
  find: () => [],
  getDeviceList: () => []
}
