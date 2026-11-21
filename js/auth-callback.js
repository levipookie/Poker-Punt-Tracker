// Landingspagina na inloggen met Google.
import * as Cloud from './cloud.js';

const title = document.getElementById('title');
const msg = document.getElementById('msg');
const back = document.getElementById('back');
const loc = { hash: location.hash, search: location.search };
// De tokens meteen uit de adresbalk en de geschiedenis halen.
history.replaceState(null, '', location.pathname);

try {
  const result = await Cloud.finishGoogle(loc);
  if (result.here) {
    location.replace('./#/account');
  } else {
    title.textContent = 'You’re signed in';
    msg.textContent = `Signed in as ${result.email}. Switch back to the Punt Tracker app on your home screen; it picks up the sign-in by itself. You can close this page.`;
  }
} catch (err) {
  title.textContent = 'Sign-in didn’t work';
  msg.textContent = err.message;
  back.hidden = false;
}
