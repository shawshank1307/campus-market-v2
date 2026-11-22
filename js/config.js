/** Site branding — change the name here and it updates everywhere. */
export const SITE = {
  name: "Campus Market",
  campus: "Main Campus",
  tagline: "The student marketplace for your campus",
  emailPlaceholder: "you@college.edu.in",
};

export const CAMPUSES = [SITE.campus];

export const LOGO = {
  large: "assets/jklu/logo-large.png",
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

/** Live backend API — Powered by Cloudflare Workers & D1 Edge Backend */
export const PRODUCTION_API_URL = "https://campus-market-backend.shawshank1307.workers.dev";
/** Supabase Configuration */
export const SUPABASE = {
  projectRef: "ackxmxvencvkcbxvfvev",
  url: "https://ackxmxvencvkcbxvfvev.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFja3hteHZlbmN2a2NieHZmdmV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNjAwNjksImV4cCI6MjEwNjkzNjA2OX0.2tA0OFHU5N452bJJkGJt-SNs-UAFZWPyPlpbM4LWIyw",
};
