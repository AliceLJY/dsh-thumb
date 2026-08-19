/**
 * dsh-thumb — phone shell for the DeepSeek Harness web GUI.
 *
 * What it fixes (measured on dsh 0.1.0-rc.6, iPhone 14 Pro viewport 393x660):
 *
 *   1. Sidebar squeezes the chat instead of covering it. The upstream column
 *      solver is explicit about this — packages/client/ui-layout exports
 *      SIDEBAR_DEFAULT=280 with the contract "the sidebar never concedes ...
 *      center absorbs any remaining deficit as the last resort". At 393px that
 *      leaves center 113px, which is what the phone actually renders. Fine on a
 *      narrow desktop window, unusable on a phone.
 *   2. Tapping a session leaves the drawer open, so you stay in the 113px slot.
 *   3. The settings sheet is a fixed two-column 800px layout; at 393px every
 *      English word wraps onto its own line and the value pickers fall off-screen.
 *
 * How it differs from the plugins on GitHub doing the same job: the CSS here
 * contains NO host class names. Upstream ships CSS Modules, so its classes carry
 * a build hash (pI_x6G_sidebarCol) that changes on every rebuild — a plugin that
 * hardcodes them dies silently on upgrade, styles simply stop applying and
 * nothing errors. Instead we locate the three columns once at runtime by their
 * stable semantic suffix and stamp our own data-thumb attributes; every rule
 * below keys off those. A rename upstream breaks the locator loudly in one
 * place, rather than the styles quietly everywhere.
 *
 * Scope guard: nothing applies unless BOTH the viewport is narrow AND the user
 * has manually expanded the sidebar. The 56px icon rail is left completely alone
 * — it already works.
 *
 * Off switch: ?thumb=0 in the URL, or localStorage.setItem('dsh-thumb','0').
 */
window.__ModuleLoader__.load({
	id: 'dsh-thumb',
	factory: (require) => {
		const module = { exports: {} };
		const exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

		const React = require('react');
		const { jsx } = require('react/jsx-runtime');

		/** Matches upstream SIDEBAR_AUTO_COLLAPSE (1024) so we engage exactly where
		 *  it starts auto-collapsing — one breakpoint, not two fighting. */
		const PHONE_MQ = '(max-width: 1023px)';
		/** Upstream SIDEBAR_COLLAPSED. A rendered width at or below this is the icon
		 *  rail, which we leave alone; anything wider is a manual expansion. */
		const RAIL_PX = 56;
		const STYLE_ID = 'dsh-thumb-css';
		const DRAWER_ATTR = 'data-thumb-drawer';

		/**
		 * Runtime locators. Key is the data-thumb value we stamp; value is the
		 * selector used to find the node once. Selectors use the semantic suffix
		 * that survives CSS-Modules hashing (`pI_x6G_sidebarCol` -> `sidebarCol`),
		 * never a full hashed class.
		 *
		 * Each of these resolved to exactly one node when probed on rc.6, so an
		 * ambiguous match means upstream restructured and we should stop rather
		 * than style the wrong element.
		 */
		const LOCATORS = {
			frame: '[class*="_frame"]',
			sidebar: '[class*="sidebarCol"]',
			center: '[class*="centerCol"]',
			details: '[class*="detailsCol"]',
		};

		/** Settings sheet parts, resolved only while the sheet is mounted. */
		const SETTINGS_LOCATORS = {
			'settings-panel': '[class*="_panel"]',
			'settings-nav': '[class*="_nav"]',
			'settings-content': '[class*="_content"]',
		};

		function disabled() {
			try {
				if (typeof location !== 'undefined'
					&& new URLSearchParams(location.search).get('thumb') === '0') return true;
				if (localStorage.getItem('dsh-thumb') === '0') return true;
			} catch (_) { /* private mode / blocked storage: stay enabled */ }
			return false;
		}

		const CSS = `
@media ${PHONE_MQ} {
  /* Everything is gated on the drawer being open. Closed rail = untouched. */

  /* Collapse the sidebar track to zero so the center column gets the full
     frame width. The center track is already minmax(0,1fr) upstream, so it
     expands on its own once the first track is gone. !important is required:
     AppFrame writes grid-template-columns as an inline style every frame. */
  html[${DRAWER_ATTR}="open"] [data-thumb="frame"] {
    grid-template-columns: 0 minmax(0, 1fr) 0 !important;
  }

  /* Lift the sidebar out of grid flow and float it over the chat. */
  html[${DRAWER_ATTR}="open"] [data-thumb="sidebar"] {
    position: fixed !important;
    top: 0 !important;
    bottom: 0 !important;
    left: 0 !important;
    width: min(86vw, 320px) !important;
    max-width: 320px !important;
    z-index: 70 !important;
    box-shadow: 0 0 44px rgb(0 0 0 / 28%) !important;
    padding-top: env(safe-area-inset-top, 0px) !important;
    padding-bottom: env(safe-area-inset-bottom, 0px) !important;
    overscroll-behavior: contain !important;
  }

  /* The one non-obvious rule, and the reason to read this comment:
     position:fixed removes the sidebar from grid flow, which frees track 1 and
     lets the center column auto-place into it — a 0px track — so the chat
     disappears entirely and only the drawer is visible. Pinning the column
     explicitly is what prevents that. (This exact failure cost the hanui plugin
     five releases; its file header documents it as the v11 "only menu visible"
     bug. Borrowed as a map, not as code.) */
  html[${DRAWER_ATTR}="open"] [data-thumb="center"] {
    grid-column: 2 !important;
    grid-row: 1 !important;
    min-width: 0 !important;
  }

  html[${DRAWER_ATTR}="open"] [data-thumb="details"] {
    display: none !important;
  }

  /* Scrim. Tapping it closes the drawer through the official layout action. */
  .dsh-thumb-scrim {
    position: fixed;
    inset: 0;
    z-index: 65;
    background: rgb(0 0 0 / 38%);
    border: 0;
    padding: 0;
    margin: 0;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    animation: dsh-thumb-fade 160ms ease;
  }
  @keyframes dsh-thumb-fade { from { opacity: 0 } to { opacity: 1 } }

  /* Settings sheet: desktop ships a two-column 800px sheet (nav + content).
     Stack it and let the nav scroll horizontally. */
  [data-thumb="settings-panel"] {
    width: 100% !important;
    max-width: 100% !important;
    height: 100% !important;
    max-height: 100% !important;
    border-radius: 0 !important;
    flex-direction: column !important;
    padding-top: env(safe-area-inset-top, 0px) !important;
    padding-bottom: env(safe-area-inset-bottom, 0px) !important;
  }
  [data-thumb="settings-nav"] {
    width: 100% !important;
    min-width: 0 !important;
    flex: 0 0 auto !important;
    flex-direction: row !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    gap: 4px !important;
    scrollbar-width: none !important;
  }
  [data-thumb="settings-nav"]::-webkit-scrollbar { display: none }
  [data-thumb="settings-nav"] > * {
    flex: 0 0 auto !important;
    white-space: nowrap !important;
  }
  [data-thumb="settings-content"] {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    width: 100% !important;
    overflow-y: auto !important;
  }
}

/* Wide viewports get nothing at all: the media query above is the only place
   any of this exists, and the attributes we stamp are inert without it. */
`;

		function ensureStyle() {
			if (typeof document === 'undefined') return;
			if (document.getElementById(STYLE_ID)) return;
			const tag = document.createElement('style');
			tag.id = STYLE_ID;
			tag.dataset.plugin = 'dsh-thumb';
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		/**
		 * Stamp data-thumb on the nodes we style.
		 *
		 * Re-run on DOM mutations because the shell remounts columns across route
		 * changes; stamping is idempotent and cheap (four querySelector calls).
		 * A locator that matches nothing is left unstamped and its rules simply
		 * never apply — degrading to stock behaviour rather than to a broken one.
		 */
		function stampFrame() {
			for (const [name, selector] of Object.entries(LOCATORS)) {
				const el = document.querySelector(selector);
				if (el && el.getAttribute('data-thumb') !== name) el.setAttribute('data-thumb', name);
			}
		}

		/**
		 * The settings sheet is transient, and its parts are only unambiguous
		 * *inside* the sheet's own overlay — `[class*="_nav"]` would collide with
		 * unrelated nodes if queried against the whole document. So we find the
		 * sheet first (a fixed, full-viewport flex-row layer) and scope from there.
		 */
		function stampSettings() {
			const sheet = Array.from(document.querySelectorAll('div,section,dialog')).find((el) => {
				const cs = getComputedStyle(el);
				if (cs.position !== 'fixed' || cs.display !== 'flex') return false;
				const r = el.getBoundingClientRect();
				return r.width >= window.innerWidth - 2 && r.height >= window.innerHeight - 2
					&& el.querySelector('[class*="_nav"]') !== null;
			});
			if (!sheet) return;
			for (const [name, selector] of Object.entries(SETTINGS_LOCATORS)) {
				const el = sheet.querySelector(selector);
				if (el && el.getAttribute('data-thumb') !== name) el.setAttribute('data-thumb', name);
			}
		}

		/**
		 * Is the sidebar expanded? Read AppFrame's *intent*, never the rendered
		 * width.
		 *
		 * AppFrame writes the solved column widths into the frame's inline
		 * grid-template-columns every frame ("280px minmax(0px, 1fr) 0px" when
		 * expanded, "56px ..." when railed). That value is upstream's decision and
		 * nothing here touches it — our stylesheet overrides the *computed* grid,
		 * which leaves the inline attribute intact as a clean signal.
		 *
		 * Measuring the sidebar's own box here instead is a trap worth spelling
		 * out, because it looks like the more direct reading and it self-locks:
		 * the drawer CSS pins the sidebar to 320px, so a width-based test reports
		 * "expanded" forever — including right after the user hits Collapse. The
		 * drawer then never closes and, worse, every close mechanism looks broken
		 * from the outside, which sends you debugging the wrong layer entirely.
		 * Rule of thumb: never derive a condition from a quantity you yourself
		 * overwrite.
		 */
		function sidebarIsExpanded() {
			const frame = document.querySelector('[data-thumb="frame"]') || document.querySelector(LOCATORS.frame);
			if (!frame) return false;
			const firstTrack = String(frame.style.gridTemplateColumns || '').trim().split(/\s+/)[0];
			const px = Number.parseFloat(firstTrack);
			return Number.isFinite(px) && px > RAIL_PX + 4;
		}

		function useIsPhone() {
			const [phone, setPhone] = React.useState(
				() => typeof window !== 'undefined' && window.matchMedia(PHONE_MQ).matches && !disabled(),
			);
			React.useEffect(() => {
				if (typeof window === 'undefined') return undefined;
				const mq = window.matchMedia(PHONE_MQ);
				const update = () => setPhone(mq.matches && !disabled());
				update();
				mq.addEventListener('change', update);
				return () => mq.removeEventListener('change', update);
			}, []);
			return phone;
		}

		/**
		 * The overlay component: keeps the stamps fresh, tracks drawer state, and
		 * renders the scrim. `closeDrawer` comes from the injected layout face
		 * (ctx.layout.toggleSidebar) — the sanctioned way to move a panel. We never
		 * synthesise clicks on upstream buttons.
		 */
		function ThumbShell({ closeDrawer }) {
			const phone = useIsPhone();
			const [open, setOpen] = React.useState(false);

			// Stamp + track. One rAF-coalesced observer drives both.
			React.useEffect(() => {
				if (typeof document === 'undefined') return undefined;
				ensureStyle();
				let raf = 0;
				const tick = () => {
					raf = 0;
					stampFrame();
					stampSettings();
					setOpen(phone && sidebarIsExpanded());
				};
				const schedule = () => { if (!raf) raf = requestAnimationFrame(tick); };
				tick();
				const obs = new MutationObserver(schedule);
				obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
				window.addEventListener('resize', schedule);
				return () => {
					obs.disconnect();
					window.removeEventListener('resize', schedule);
					if (raf) cancelAnimationFrame(raf);
				};
			}, [phone]);

			// Reflect state onto <html> so the CSS above can key off it.
			React.useEffect(() => {
				const de = document.documentElement;
				if (phone && open) de.setAttribute(DRAWER_ATTR, 'open');
				else de.removeAttribute(DRAWER_ATTR);
				return () => de.removeAttribute(DRAWER_ATTR);
			}, [phone, open]);

			/**
			 * Close the drawer after picking a session. Upstream marks rows with
			 * role="treeitem"; project rows carry the same role but only expand a
			 * group, so they must NOT close the drawer — you'd have to reopen it to
			 * reach the sessions you just revealed.
			 *
			 * Capture phase + a frame of delay: let the app handle the tap and start
			 * its own transition first, so closing never races the navigation.
			 */
			React.useEffect(() => {
				if (!phone) return undefined;
				const onTap = (e) => {
					const target = e.target;
					if (!(target instanceof Element)) return;
					const row = target.closest('[role="treeitem"]');
					if (!row) return;
					const cls = typeof row.className === 'string' ? row.className : '';
					if (!/sessionRow|searchResultRow/.test(cls)) return;   // project/group rows: leave open
					if (row.closest('[data-thumb="sidebar"]') === null) return;
					setTimeout(() => { if (sidebarIsExpanded()) closeDrawer?.(); }, 160);
				};
				document.addEventListener('click', onTap, true);
				return () => document.removeEventListener('click', onTap, true);
			}, [phone, closeDrawer]);

			if (!phone || !open) return null;
			return jsx('button', {
				type: 'button',
				className: 'dsh-thumb-scrim',
				'aria-label': 'Close sidebar',
				onClick: () => closeDrawer?.(),
			});
		}

		function apply(ctx) {
			ensureStyle();
			ctx.slots.inject('shell.overlay', () => ctx.slots.register({
				name: 'shell.overlay',
				id: 'dsh-thumb',
				inject: () => ({ closeDrawer: () => ctx.layout?.toggleSidebar?.() }),
			}, ThumbShell));
		}

		/**
		 * Cordis SERVICE names — not package names. The two `inject` fields in this
		 * plugin look alike and mean different things: package.json's
		 * `dsh.client.inject` lists packages (module load order), while this one
		 * lists services the apply world waits for. Getting it wrong does not fail
		 * loudly at the plugin level: the entry just never activates, and the shell
		 * reports "web boot: 1 entry did not activate" while the whole page stays
		 * blank. Mirrors what ui-sidebar injects to reach the same layout face.
		 */
		const inject = ['slots', 'layout'];

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
