/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { css, html } from '../deps_app.ts';
import { TailwebAppVM } from '../tailweb_app_vm.ts';

export const WELCOME_PANEL_HTML = html`
<form id="welcome-panel" autocomplete="off">
<fieldset id="welcome-panel-fieldset">
  <div id="welcome-panel-form-title" class="h6 high-emphasis-text form-row">title</div>

  <div class="form-row body2 medium-emphasis-text">
    Welcome to <span class="high-emphasis-text">Denoflare Tail</span>!
    <p>View real-time requests and logs from <a href="https://workers.cloudflare.com/" target="_blank">Cloudflare Workers</a> from the comfort of your browser. 
    A few enhancements over what's provided <a href="https://blog.cloudflare.com/introducing-workers-dashboard-logs/" target="_blank">by default</a> in the Cloudflare dashboard:</p>
    <ul>
        <li>Tail multiple workers at the same time</li>
        <li>Advanced filtering and multi-color output similar to <a href="https://developers.cloudflare.com/workers/cli-wrangler/commands#tail" target="_blank">wrangler tail</a></li>
        <li>Durable object class/name/id and colo information can be surfaced with <a href="TODO" target="_blank">logprops</a></li>
        <li>Multiple profiles, switch easily between multiple accounts</li>
        <li>No need to log in with your full Cloudflare credentials.  Profiles are stored locally in the browser, and can be permissioned only for tailing workers</li>
        <li>Implemented as a standard open source Cloudflare Worker, <a href="TODO" target="_blank">deploy it to your own account</a>, 
            or <a href="TODO" target="_blank">host it locally</a> with <a href="https://github.com/skymethod/denoflare" target="_blank"><code>denoflare</code></a></li>
    </ul>
    <p id="welcome-panel-trailer">Create a new profile to get started!</p>
    <p id="about-panel-trailer">Learn more at the <a href="https://github.com/skymethod/denoflare" target="_blank">Denoflare GitHub repo</a>!</p>
  </div>

  <div class="form-rhs">
    <button id="welcome-panel-new-profile" type="submit">New profile</button>
    <button id="welcome-panel-close" type="submit">Close</button>
  </div>
</fieldset>
</form>
`;

export const WELCOME_PANEL_CSS = css`

    #welcome-panel-form-title {
        user-select: none; -webkit-user-select: none;
    }

`;

export function initWelcomePanel(document: HTMLDocument, vm: TailwebAppVM): () => void {
    const welcomePanelElement = document.getElementById('welcome-panel') as HTMLElement;
    const titleElement = document.getElementById('welcome-panel-form-title') as HTMLElement;
    const welcomeTrailerElement = document.getElementById('welcome-panel-trailer') as HTMLElement;
    const aboutTrailerElement = document.getElementById('about-panel-trailer') as HTMLElement;
    const newProfileButton = document.getElementById('welcome-panel-new-profile') as HTMLButtonElement;
    const closeButton = document.getElementById('welcome-panel-close') as HTMLButtonElement;

    newProfileButton.onclick = e => {
        e.preventDefault();
        vm.newProfile();
    };

    closeButton.onclick = e => {
        e.preventDefault();
        vm.closeAbout();
    };

    return () => {
        const wasHidden = welcomePanelElement.style.display === 'none';
        const show = vm.welcomeShowing && !vm.profileForm.showing || vm.aboutShowing;
        welcomePanelElement.style.display = show ? 'block' : 'none';
        const welcome = vm.welcomeShowing;
        titleElement.textContent = welcome ? 'Hello 👋' : 'About';
        welcomeTrailerElement.style.display = welcome ? 'block' : 'none';
        aboutTrailerElement.style.display = welcome ? 'none' : 'block';
        newProfileButton.style.display = welcome ? 'block' : 'none';
        closeButton.style.display = welcome ? 'none' : 'block';

        if (wasHidden && show) {
            console.log(`${welcome ? 'welcome' : 'about'} panel open`);

            setTimeout(() => {
                (welcome ? newProfileButton : closeButton).focus();
            }, 0); 
        }
    };    
}
