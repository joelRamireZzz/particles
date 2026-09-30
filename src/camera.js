
const IDEAL = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };

const CONSTRAINTS = [
  { video: { facingMode: "user", ...IDEAL }, audio: false },
  { video: { ...IDEAL }, audio: false },
  { video: { facingMode: "user" }, audio: false },
  { video: true, audio: false },
];

const READY_TIMEOUT_MS = 8000;

export class CameraError extends Error {
  constructor(kind, message, { hint, cause } = {}) {
    super(message);
    this.name = "CameraError";
    this.kind = kind;
    this.hint = hint;
    this.cause = cause;
  }
}

export function describeEnvironment() {
  const secure = window.isSecureContext === true;
  const hasApi = typeof navigator.mediaDevices?.getUserMedia === "function";
  return { secure, hasApi, protocol: location.protocol, host: location.host };
}

function diagnose(error) {
  const name = error?.name || "";

  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return {
      kind: "denied",
      message: "Permiso de cámara denegado.",
      hint:
        "El navegador ya guardó el 'no'. Vuelve a permitirlo desde el candado o el icono de cámara " +
        "junto a la barra de direcciones y pulsa Reintentar.",
    };
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      kind: "not-found",
      message: "No se ha encontrado ninguna cámara.",
      hint: "Conecta una cámara y comprueba que el navegador tenga permiso para usarla.",
    };
  }

  if (name === "NotReadableError" || name === "TrackStartError") {
    return {
      kind: "busy",
      message: "La cámara está ocupada.",
      hint: "Ciérrala en otra aplicación (una videollamada, Zoom…) y vuelve a intentarlo.",
    };
  }

  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return { kind: "constraints", message: "La cámara no admite la calidad solicitada.", hint: "Reintenta para usar una calidad compatible." };
  }

  if (name === "AbortError") {
    return { kind: "aborted", message: "El navegador interrumpió el acceso a la cámara.", hint: "Pulsa Reintentar." };
  }

  return {
    kind: "unknown",
    message: `No se pudo abrir la cámara (${name || "error desconocido"}).`,
    hint: error?.message || "Pulsa Reintentar.",
  };
}

function firstFrameTimeout(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        new CameraError("timeout", "La cámara no entregó imagen.", {
          hint: "Puede que otra aplicación la esté usando. Reintenta.",
        }),
      );
    }, ms);
  });
}

/** Espera a que el <video> tenga un frame decodificable, con timeout. */
function waitForFirstFrame(video, timeoutMs) {
  if (video.readyState >= 2 && video.videoWidth > 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = firstFrameTimeout(timeoutMs);
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("resize", onReady);
    };

    const onReady = () => {
      if (video.readyState < 2 || video.videoWidth === 0) return;
      cleanup();
      resolve();
    };

    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
    video.addEventListener("resize", onReady);
    video.load?.();
  });
}

async function requestStream() {
  const { secure, hasApi, protocol } = describeEnvironment();

  if (!hasApi) {
    throw new CameraError(
      "insecure",
      secure
        ? "Este navegador no permite el acceso a la cámara."
        : "La cámara requiere una conexión segura.",
      {
        hint: secure
          ? "Prueba con Chrome, Edge, Safari o Firefox actualizados."
          : `Abre esta página con https:// o desde http://localhost (ahora mismo usa ${protocol}). ` +
            "Los navegadores móvil bloquean la cámara en http://.",
      },
    );
  }

  let lastError = null;

  for (const constraints of CONSTRAINTS) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      const info = diagnose(error);
      lastError = error;


      if (info.kind === "denied" || info.kind === "not-found" || info.kind === "insecure") {
        throw new CameraError(info.kind, info.message, { hint: info.hint, cause: error });
      }
    }
  }

  const info = diagnose(lastError);
  throw new CameraError(info.kind, info.message, { hint: info.hint, cause: lastError });
}


export async function startCamera(video, { onEnded, onStatus } = {}) {
  onStatus?.("Solicitando cámara…");

  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.muted = true;

  const stream = await requestStream();

  onStatus?.("Conectando imagen…");
  video.srcObject = stream;

  try {
    try {
      await video.play();
    } catch {
    }

    await waitForFirstFrame(video, READY_TIMEOUT_MS);
  } catch (error) {

    stopCamera(stream);
    video.srcObject = null;
    throw error;
  }

  const track = stream.getVideoTracks()[0];
  if (track) {
    track.addEventListener("ended", () => {
      video.srcObject = null;
      onEnded?.();
    });
  }

  onStatus?.("Cámara lista");
  return { stream, track };
}

export function stopCamera(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function queryPermission() {
  try {
    if (!navigator.permissions?.query) return "unknown";
    const status = await navigator.permissions.query({ name: "camera" });
    return status.state;
  } catch {
    return "unknown";
  }
}
