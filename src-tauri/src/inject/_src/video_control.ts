// 全てのビデオ要素を取得して停止
document.querySelectorAll("video").forEach((video) => {
  video.pause();
  video.currentTime = 0; // 再生位置を先頭に戻す
});
