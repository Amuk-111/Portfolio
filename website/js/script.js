const button = document.getElementById('loadSceneBtn');
const viewerCanvas = document.getElementById('viewerCanvas');

if (button && viewerCanvas) {
  button.addEventListener('click', () => {
    viewerCanvas.textContent = 'Scene loading will be added here next.';
    viewerCanvas.style.color = '#ffffff';
  });
}
