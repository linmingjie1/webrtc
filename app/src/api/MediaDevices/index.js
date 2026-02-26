
// https://developer.mozilla.org/zh-CN/docs/Web/API/MediaDevices
/**
 * MediaDevices 接口提供访问设备的媒体数据。
 */

export default {
  /**
   * enumerateDevices可用的媒体输入和输出设备的列表，例如麦克风，摄像机，耳机设备等。
   */
  async enumerateDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      console.log("不支持 enumerateDevices");
      return;
    }

    try {
      const mediaDeviceInfos = await navigator.mediaDevices.enumerateDevices();

      console.log('mediaDeviceInfos:', mediaDeviceInfos);

      // https://developer.mozilla.org/en-US/docs/Web/API/MediaDeviceInfo#instance_properties
      mediaDeviceInfos.forEach(function (device) {
        console.log(device.toJSON());
      });

    } catch (error) {
      console.error("enumerateDevices 失败:", error);
    }
  },

  /**
   * 获取浏览器支持的媒体约束属性，如视频分辨率、帧率等等
   * 媒体约束属性有什么用：
   *      获取音视频流时，用来告诉浏览器你想要什么样的音视频轨道的配置参数，让浏览器尽力按你的要求去获取匹配的媒体流。
   */
  getSupportedConstraints() {
    let supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
    console.log('supportedConstraints:', supportedConstraints)
  },

  /**
   * 提示用户给予使用媒体输入权限，并返回MediaStream对象
   */
  async getUserMedia() {
    let constraints = {
      // audio: true, // 使用浏览器的默认音频配置（默认设备、默认采样率等）
      // video: true // 使用浏览器的默认视频配置（默认设备、默认分辨率、默认帧率等）
    };

    /* constraints = {
      audio: true,
      video: {
        // 强制要求浏览器获取4K分辨率的视频流，但没有设备满足，此时抛出OverconstrainedError（无法满足要求错误）
        width: { exact: 4096 },
        height: { exact: 2160 }
      }
    }; */

    constraints = {
      audio: true,
      video: {
        width: { ideal: 1920, max: 4096 },
        height: { ideal: 1080, max: 2160 }
      }
    };

    try {
      // 返回的 promise 对象可能既不会 resolve 也不会 reject，因为用户不是必须选择允许或拒绝
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('mediaStream:', mediaStream);
    } catch (err) {
      // 有哪些异常：https://developer.mozilla.org/zh-CN/docs/Web/API/MediaDevices/getUserMedia#异常
      console.log(err);
    }
  }
};
