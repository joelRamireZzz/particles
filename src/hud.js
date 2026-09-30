const setText = (node, value) => {
  if (node && node.textContent !== value) node.textContent = value;
};


export class Hud {
  constructor(root = document) {
    this.fps = root.getElementById("fps");
    this.hands = root.getElementById("hands");
    this.position = root.getElementById("position");
  }

  update({ fps, hands, x, y }) {
    setText(this.fps, String(Math.round(fps)));
    setText(this.hands, String(hands));
    setText(this.position, `${Math.round(x)},${Math.round(y)}`);
  }
}
