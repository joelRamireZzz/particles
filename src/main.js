import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const vision = await FilesetResolver.forVisionTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
);

const handLandmarker = await HandLandmarker.createFromOptions(vision, {
  baseOptions: {
    modelAssetPath:
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
  },
  numHands: 2,
  runningMode: "VIDEO"
});

const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");

let particulas = [];
let manoX = 0;
let manoY = 0;
let manoZ = 0;
let manoAbierta = false;
let manoAbiertaAnterior = false;
let manoDetectada = false;
let fps = 0;
let ultimoTiempo = performance.now();

const video = document.querySelector("video");
navigator.mediaDevices
.getUserMedia({ video: true, audio: false })
.then((localMediaStream) => {
  video.srcObject = localMediaStream;
  video.addEventListener("loadeddata", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  console.log("el video ya está listo, y el modelo ya está cargado");
  createParticles(100);
  window.addEventListener("resize", resizeCanvas);
 const maxParticulas = window.innerWidth < 768 ? 50 : 400;

setInterval(() => {
  if (particulas.length < maxParticulas) {
    createParticle();
  }
}, 100);

  predictWebcam();
});
  })
  .catch((error) => {
    console.log("Rejected!", error);
  });

  function createParticles(count){
   for (let i = 0; i < count; i++) {
   particulas.push({
   x: Math.random() * canvas.width,
   y: Math.random() * canvas.height,
   z: Math.random(),
   vx: Math.random() < 0.5 ? -1 : 1,
   vy: Math.random() < 0.5 ? -1 : 1,
   radius:3,
   alpha:Math.random()
  });
 }
   for (let i = 0; i < count; i++) {
    createParticle();
  }
};

  function drawParticles() {
  particulas.forEach((p) => {

    // activar brillo
    //ctx.shadowBlur = 5;
   // ctx.shadowColor = manoAbierta ? "orange" : "cyan";
    ctx.beginPath();
    const escala = 1 + p.z;
    ctx.arc(
    p.x,
    p.y,
    p.radius * escala,
    0,
    2 * Math.PI
  );

    if(manoAbierta){
      ctx.fillStyle = "orange";
    }else{
      ctx.fillStyle = "cyan";
    }
    ctx.fill();
    // apagar brillo para no afectar otros dibujos
    ctx.shadowBlur = 0;
  });
};
function updateParticles(){
  particulas.forEach((p)=>{
    const dx = manoX - p.x;
    const dy = manoY - p.y;
    const distancia = Math.sqrt(dx * dx + dy * dy);
    const perpendicularX = -dy;
    const perpendicularY = dx;
    const tx = perpendicularX / distancia + 1;
    const ty = perpendicularY / distancia + 1;
    
    // interacción con la mano
    const radioInfluencia = 300;
    if(manoDetectada && distancia < radioInfluencia){
      const fuerza = 70 / (distancia + 1);
     if (manoAbierta) {
    // repulsión
    p.vx -= dx * fuerza * 0.001;
    p.vy -= dy * fuerza * 0.001;

    // órbita
    p.vx -= tx * fuerza * 0.5;
    p.vy -= ty * fuerza * 0.5;
} else {
    // atracción
    p.vx += dx * fuerza * 0.001;
    p.vy += dy * fuerza * 0.001;
}
    }
    // movimiento
    p.x += p.vx;
    p.y += p.vy;
    // fricción
    p.vx *= 0.95;
    p.vy *= 0.95;
    // tamaño según velocidad
    const velocidad = Math.sqrt(
      p.vx * p.vx + p.vy * p.vy
    );
    p.radius = 3 + velocidad;
    // límite de velocidad
    const velocidadMax = 5;

    p.vx = Math.max(Math.min(p.vx, velocidadMax), -velocidadMax);
    p.vy = Math.max(Math.min(p.vy, velocidadMax), -velocidadMax);
  });
}

  function predictWebcam(){
    const tiempoActual = performance.now();
    fps = 1000 / (tiempoActual - ultimoTiempo);
    ultimoTiempo = tiempoActual;
    document.getElementById("fps").textContent = Math.round(fps);
    const results = handLandmarker.detectForVideo(video, performance.now());
    document.getElementById("hands").textContent =
    results.landmarks.length;
    manoDetectada = results.landmarks.length > 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height); 

    results.landmarks.forEach((hand)=>{
      manoDetectada = true;
     
    hand.forEach(landmark=>{
    const x = (1 - landmark.x) * canvas.width;
    const y = landmark.y * canvas.height;

    ctx.beginPath();
    ctx.arc(x,y,5,0,2 * Math.PI);
    ctx.fillStyle= "green";
    ctx.fill();
   });
       manoAbierta = handOpen(hand) > 3; //3 = dedos necesarios para mano = abierta
       
       if (!manoAbiertaAnterior && manoAbierta) {
         explosion();
        }
        manoAbiertaAnterior = manoAbierta;


      const muneca = hand[0];
      manoX = (1 - muneca.x) * canvas.width;
      manoY = muneca.y * canvas.height;
      manoZ = muneca.z;
      ctx.beginPath();
      ctx.arc(manoX, manoY, 20, 0, Math.PI * 2);
      ctx.fillStyle = "red";
      ctx.fill();

    if(manoAbierta){

    }else{
      
    }
    });
    console.log(results);
    updateParticles();
    drawConnections();
    drawParticles();
    updateHUD();

requestAnimationFrame(predictWebcam);

  };

  function distance(pointA,pointB){
    const dx = pointA.x - pointB.x;
    const dy = pointA.y -pointB.y;

    return Math.sqrt(dx * dx + dy * dy);
  }

 function handOpen(hand){
    const indiceTip = hand[8];
    const indiceMcp = hand[5];
    
    const distanceIndice = distance(indiceTip, indiceMcp);

    const medioTip = hand[12];
    const medioMcp = hand[9];

    const distanceMedio = distance(medioTip, medioMcp);

    const anularTip = hand[16];
    const anularMcp = hand[13];

    const distanceAnular = distance(anularTip, anularMcp);

    const meniqueTip = hand[20];
    const meniqueMcp = hand[17];

    const distanceMenique =  distance(meniqueTip, meniqueMcp);

    const muneca = hand[0];
    const tamanoMano = distance(muneca,medioMcp);

    const indiceNormalizado = distanceIndice / tamanoMano;
    const medioNormalizado  = distanceMedio/tamanoMano;
    const anularNormalizado = distanceAnular/tamanoMano;
    const meniqueNormalizado = distanceMenique/tamanoMano;
 
    //console.log(distanceIndice,distanceMedio,distanceAnular,distanceMenique);

    
    const indiceExtendido = isFingerExtended(indiceNormalizado);
    const medioExtendido = isFingerExtended(medioNormalizado);
    const anularExtendido = isFingerExtended(anularNormalizado);
    const meniqueExtendido = isFingerExtended(meniqueNormalizado);
      
    const dedosExtendidos = Number(indiceExtendido) +
     Number(medioExtendido) +
     Number(anularExtendido) +
     Number(meniqueExtendido);

    return dedosExtendidos;

  }; 

function isFingerExtended(valorNormalizado) {
  return valorNormalizado > 0.5;
};

function drawConnections() {
  const maxDist = 100;

  for (let i = 0; i < particulas.length; i++) {
    for (let j = i + 1; j < particulas.length; j++) {

      const p1 = particulas[i];
      const p2 = particulas[j];

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;

      const distancia = Math.sqrt(dx * dx + dy * dy);

      if (distancia < maxDist) {

        const opacidad = 1 - (distancia / maxDist);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);

        ctx.strokeStyle = `rgba(255,255,255,${opacidad})`;
        ctx.lineWidth = 1;

        ctx.stroke();
      }
    }
  }
}

function explosion(){
  particulas.forEach((p) => {
  const dx = p.x - manoX;
  const dy = p.y - manoY;
  const distancia = Math.sqrt(dx * dx + dy * dy)+1;
  const fuerza = 70 / (distancia + 1);
  const nx = dx/distancia;
  const ny = dy/distancia;
    const radioInfluencia = 200;
  if(distancia < radioInfluencia){
    p.vx += nx*fuerza;
    p.vy += ny*fuerza;
    }
});
}


function createParticle() {
  particulas.push({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    z: Math.random(),
    vx: Math.random() < 0.5 ? -1 : 1,
    vy: Math.random() < 0.5 ? -1 : 1,
    radius: 3,
    alpha: Math.random()
  });
};

function resizeCanvas() {

    const oldWidth = canvas.width;
    const oldHeight = canvas.height;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const scaleX = canvas.width / oldWidth;
    const scaleY = canvas.height / oldHeight;

    particulas.forEach((p) => {
        p.x *= scaleX;
        p.y *= scaleY;
    });
}

function updateHUD(){

    document.getElementById("fps").textContent =
        Math.round(fps);

    document.getElementById("hands").textContent =
        manoDetectada ? "1" : "0";


    document.getElementById("position").textContent =
        Math.round(manoX) + "," + Math.round(manoY);

}