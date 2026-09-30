// Configuration for the Flight 182 questionnaire.
//
// BACKEND_URL: the deployed Google Apps Script Web App URL (see backend/Code.gs
// and the README for setup steps).
//
// Leave it as '' to run in LOCAL-ONLY mode: the quiz still works, but results
// are not saved anywhere, and two players can be pushed to the same character
// (no duplicate-prevention). This is the right mode for testing on your own
// machine before you deploy anything.
//
// Once you've deployed the Apps Script backend and pasted its URL below,
// results are recorded and duplicate characters are avoided automatically.
window.CONFIG = {
  BACKEND_URL: 'https://script.google.com/macros/s/AKfycbyej_bHfKEeKSLLwm3pFR9OpFfDntPtwd2jzoZxTqTsO5mM1PoSzj5UAgAF20JPVosc/exec'
};
