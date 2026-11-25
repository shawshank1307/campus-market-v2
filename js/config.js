/** Site branding — change the name here and it updates everywhere. */
export const SITE = {
  name: "Campus Market",
  campus: "Main Campus",
  tagline: "Buy and sell with students on your campus",
  emailPlaceholder: "you@gmail.com",
};

export const CAMPUSES = [SITE.campus];

export const LOGO = {
  large: "assets/jklu/logo-large.png",
  emblem: "assets/jklu/emblem.png",
};

/** Campus photos used in the home hero and sign-in screens. */
export const CAMPUS_PHOTOS = [
  { src: "assets/jklu/campus-1.jpg", srcMd: "assets/jklu/campus-1-md.jpg" },
  { src: "assets/jklu/campus-2.jpg", srcMd: "assets/jklu/campus-2-md.jpg" },
  { src: "assets/jklu/campus-3.jpg", srcMd: "assets/jklu/campus-3-md.jpg" },
  { src: "assets/jklu/campus-5.jpg", srcMd: "assets/jklu/campus-5-md.jpg" },
];

export function photoUrl(photo) {
  return window.matchMedia("(max-width: 768px)").matches ? photo.srcMd : photo.src;
}

/** Production API (Cloudflare Workers + D1). Change this after deploying your own worker. */
export const PRODUCTION_API_URL = "https://campus-market-backend.shawshank1307.workers.dev";
