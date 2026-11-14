// ==UserScript==
// @name         Zoho Calendar - mobilny tyzdenny prehlad
// @namespace    zoho-calendar-tools
// @version      2.4
// @description  Zvisly mobilny kalendar (iPhone Safari) ako v aplikacii, s filtrom
// @match        https://creatorapp.zoho.com/michalbokovi/service-system/*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/valo-valo-M/zoho-calendar/main/zoho-calendar.meta.js
// @downloadURL  https://raw.githubusercontent.com/valo-valo-M/zoho-calendar/main/zoho-calendar.user.js
// ==/UserScript==

(function () {
    'use strict';

    if (window.__zohoCalendarMobileInstalled) return;
    window.__zohoCalendarMobileInstalled = true;

    const STYLE_ID = 'zoho-mobile-calendar-style';
    const DARK_STYLE_ID = 'zoho-mobile-calendar-dark';
    const PANEL_ID = 'zoho-mobile-calendar';

    // 'auto'  = tmavy rezim podla nastavenia iPhonu (svetly cez den, tmavy v noci)
    // 'dark'  = vzdy tmavy, 'light' = vzdy svetly
    const THEME = 'auto';

    const DEFAULT_COLOR = '#6a67ae';

    let lastSignature = '';
    let observedCalendar = null;
    let observer = null;
    let updateTimer = null;

    /* ------------------------------------------------------------------ */
    /* Pomocne funkcie                                                    */
    /* ------------------------------------------------------------------ */

    function getCalendar() {
        return document.querySelector('#Kalendar_calendar');
    }

    function getJq() {
        const jq = window.jQuery || window.$;
        return jq && jq.fn && jq.fn.fullCalendar ? jq : null;
    }

    function parseKey(key) {
        const p = key.split('-').map(Number);
        return new Date(p[0], p[1] - 1, p[2]);
    }

    function todayKey() {
        const t = new Date();
        return [
            t.getFullYear(),
            String(t.getMonth() + 1).padStart(2, '0'),
            String(t.getDate()).padStart(2, '0')
        ].join('-');
    }

    /* ------------------------------------------------------------------ */
    /* Tmavy rezim a banner                                               */
    /* ------------------------------------------------------------------ */

    // Zoho nema vlastny tmavy rezim, preto invertujeme farby celej stranky.
    // Obrazky, video a nas panel sa invertuju spat.
    function installDarkMode() {
        const root = document.documentElement;
        const mq = window.matchMedia
            ? window.matchMedia('(prefers-color-scheme: dark)')
            : null;

        const apply = function () {
            const dark = THEME === 'dark' ||
                (THEME === 'auto' && !!mq && mq.matches);
            root.classList.toggle('zmc-dark', dark);
        };

        apply();

        if (mq) {
            if (mq.addEventListener) mq.addEventListener('change', apply);
            else if (mq.addListener) mq.addListener(apply);
        }

        if (document.getElementById(DARK_STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = DARK_STYLE_ID;
        style.textContent = `
            html.zmc-dark {
                background: #ffffff;
                filter: invert(1) hue-rotate(180deg);
            }

            html.zmc-dark img,
            html.zmc-dark picture,
            html.zmc-dark video,
            html.zmc-dark canvas,
            html.zmc-dark [style*="background-image"],
            html.zmc-dark #${PANEL_ID} {
                filter: invert(1) hue-rotate(180deg);
            }
        `;
        root.appendChild(style);
    }

    // Horny banner "Otvorit v aplikacii Creator" je Safari Smart App Banner
    // z <meta name="apple-itunes-app">. Zahodime ho co najskor.
    function removeAppBanner() {
        const kill = function () {
            document.querySelectorAll('meta[name="apple-itunes-app"]')
                .forEach(function (m) { m.remove(); });
        };

        kill();

        const mo = new MutationObserver(kill);
        mo.observe(document.documentElement, { childList: true, subtree: true });

        document.addEventListener('DOMContentLoaded', function () {
            kill();
            setTimeout(function () { mo.disconnect(); }, 5000);
        });
    }

    /* ------------------------------------------------------------------ */
    /* Styl                                                               */
    /* ------------------------------------------------------------------ */

    function installStyle() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #Kalendar_calendar .fc-view-container {
                display: none !important;
            }

            #Kalendar_calendar {
                height: auto !important;
                min-height: 0 !important;
            }

            #${PANEL_ID} {
                --zmc-page: #ffffff;
                --zmc-text: #1c1c1e;
                --zmc-muted: #8e8e93;
                --zmc-line: #e5e5ea;
                --zmc-field: #f2f2f7;
                --zmc-accent: #007aff;
                --zmc-today: rgba(0, 122, 255, 0.08);

                width: 100%;
                box-sizing: border-box;
                padding-bottom: env(safe-area-inset-bottom);
                background: var(--zmc-page);
                color: var(--zmc-text);
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text",
                             "Helvetica Neue", Arial, sans-serif;
                -webkit-text-size-adjust: 100%;
                -webkit-font-smoothing: antialiased;
            }

            html.zmc-dark #${PANEL_ID} {
                --zmc-page: #000000;
                --zmc-text: #f2f2f7;
                --zmc-muted: #98989f;
                --zmc-line: #2c2c2e;
                --zmc-field: #1c1c1e;
                --zmc-accent: #0a84ff;
                --zmc-today: rgba(10, 132, 255, 0.16);
            }

            #${PANEL_ID} * {
                box-sizing: border-box;
            }

            /* ---- Den ---- */
            #${PANEL_ID} .zmc-day {
                display: flex;
                align-items: stretch;
                min-height: 54px;
                border-bottom: 1px solid var(--zmc-line);
            }

            #${PANEL_ID} .zmc-today {
                background: var(--zmc-today);
            }

            #${PANEL_ID} .zmc-date {
                flex: 0 0 54px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 6px 0;
                border-right: 1px solid var(--zmc-line);
                font-size: 15px;
                line-height: 1.3;
                text-align: center;
            }

            #${PANEL_ID} .zmc-wd {
                color: var(--zmc-muted);
            }

            #${PANEL_ID} .zmc-today .zmc-date,
            #${PANEL_ID} .zmc-today .zmc-wd {
                color: var(--zmc-accent);
                font-weight: 700;
            }

            /* ---- Stitky udalosti ---- */
            #${PANEL_ID} .zmc-events {
                flex: 1 1 auto;
                min-width: 0;
                display: flex;
                flex-wrap: wrap;
                align-content: center;
                gap: 6px;
                padding: 8px;
            }

            #${PANEL_ID} .zmc-chip {
                max-width: 100%;
                margin: 0;
                padding: 4px 8px;
                border: 0;
                border-radius: 6px;
                background: var(--c, ${DEFAULT_COLOR});
                color: #ffffff;
                font-family: inherit;
                font-size: 12.5px;
                font-weight: 500;
                line-height: 1.25;
                text-align: left;
                overflow-wrap: anywhere;
                cursor: pointer;
                -webkit-appearance: none;
                appearance: none;
                -webkit-tap-highlight-color: transparent;
                touch-action: manipulation;
            }

            #${PANEL_ID} .zmc-chip:active {
                opacity: 0.7;
            }

            #${PANEL_ID} .zmc-t {
                font-weight: 800;
                margin-right: 3px;
            }

            #${PANEL_ID} .zmc-error {
                padding: 14px;
                color: #ff3b30;
                font-size: 14px;
            }
        `;
        document.head.appendChild(style);
    }

    /* ------------------------------------------------------------------ */
    /* Panel                                                              */
    /* ------------------------------------------------------------------ */

    // Vrati kontajner so zoznamom dni. Panel sa vytvori len raz.
    function ensureList(calendar) {
        let panel = document.getElementById(PANEL_ID);

        if (panel && panel.previousElementSibling !== calendar) {
            panel.remove();
            panel = null;
        }

        if (!panel) {
            panel = document.createElement('div');
            panel.id = PANEL_ID;

            const list = document.createElement('div');
            list.className = 'zmc-list';

            panel.appendChild(list);

            calendar.insertAdjacentElement('afterend', panel);
            lastSignature = '';
        }

        return panel.querySelector('.zmc-list');
    }

    function showError(message) {
        const calendar = getCalendar();
        if (!calendar) return;

        installStyle();
        const list = ensureList(calendar);
        list.innerHTML = '';

        const error = document.createElement('div');
        error.className = 'zmc-error';
        error.textContent = message;
        list.appendChild(error);

        lastSignature = '';
    }

    // Rozdelenie udalosti do dni (vratane viacdnovych). End je exkluzivny.
    function groupByDay(events, dates) {
        const groups = {};
        dates.forEach(function (d) { groups[d] = []; });

        events.forEach(function (ev) {
            if (!ev.start) return;

            const first = ev.start.clone().startOf('day');
            let last = first.clone();

            if (ev.end) {
                last = ev.end.clone().subtract(1, 'ms').startOf('day');
                if (last.isBefore(first)) last = first.clone();
            }

            const d = first.clone();
            let guard = 0;

            while (!d.isAfter(last) && guard++ < 62) {
                const key = d.format('YYYY-MM-DD');
                if (groups[key]) groups[key].push(ev);
                d.add(1, 'day');
            }
        });

        Object.keys(groups).forEach(function (key) {
            groups[key].sort(function (a, b) {
                return a.start.valueOf() - b.start.valueOf();
            });
        });

        return groups;
    }

    function chipPrefix(event, date) {
        if (event.start.format('YYYY-MM-DD') !== date) return '← ';

        if (!event.allDay && event.start.hasTime && event.start.hasTime()) {
            return event.start.format('HH:mm') + ' ';
        }

        return '';
    }

    function buildDay(date, dayEvents, today, originalLinks) {
        const dateObj = parseKey(date);

        const day = document.createElement('section');
        day.className = 'zmc-day' + (date === today ? ' zmc-today' : '');

        const label = document.createElement('div');
        label.className = 'zmc-date';

        const num = document.createElement('div');
        num.className = 'zmc-num';
        num.textContent = String(dateObj.getDate()).padStart(2, '0');

        const wd = document.createElement('div');
        wd.className = 'zmc-wd';
        wd.textContent = dateObj
            .toLocaleDateString('sk-SK', { weekday: 'short' })
            .replace('.', '');

        label.appendChild(num);
        label.appendChild(wd);
        day.appendChild(label);

        const list = document.createElement('div');
        list.className = 'zmc-events';

        dayEvents.forEach(function (event) {
            const id = String(event.id || event._id || '');
            const title = event.title || event.description || 'Udalosť';
            const color = event.backgroundColor || event.color || DEFAULT_COLOR;

            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'zmc-chip';
            chip.style.setProperty('--c', color);

            const prefix = chipPrefix(event, date);

            if (prefix) {
                const t = document.createElement('span');
                t.className = 'zmc-t';
                t.textContent = prefix.trim();
                chip.appendChild(t);
                chip.appendChild(document.createTextNode(' '));
            }

            chip.appendChild(document.createTextNode(title));

            chip.addEventListener('click', function () {
                const fresh = getCalendar();
                const link = fresh && fresh.querySelector(
                    '.fc-event[reclinkid="' + id + '"]'
                );

                if (link) {
                    link.click();
                } else if (originalLinks[id]) {
                    originalLinks[id].click();
                } else {
                    alert('Pôvodný odkaz na záznam sa nenašiel. ID: ' + id);
                }
            });

            list.appendChild(chip);
        });

        day.appendChild(list);
        return day;
    }

    function buildCalendar() {
        const calendar = getCalendar();
        const jq = getJq();
        if (!calendar || !jq) return;

        let events;

        try {
            events = jq(calendar).fullCalendar('clientEvents') || [];
        } catch (error) {
            showError('Nepodarilo sa načítať udalosti: ' + error.message);
            return;
        }

        const dates = Array.from(
            calendar.querySelectorAll('th.fc-day-header[data-date]')
        )
            .map(function (h) { return h.getAttribute('data-date'); })
            .filter(Boolean);

        if (!dates.length) {
            showError('Nenašli sa dátumy. Prepnite kalendár na týždenné zobrazenie.');
            return;
        }

        const existing = document.getElementById(PANEL_ID);

        // Podpis: prekreslime len ked sa nieco zmenilo
        const signature = JSON.stringify([
            todayKey(),
            dates,
            events.map(function (e) {
                return [
                    e.id || e._id,
                    e.title,
                    e.start && e.start.format(),
                    e.end && e.end.format(),
                    e.allDay,
                    e.backgroundColor
                ];
            })
        ]);

        if (existing && existing.previousElementSibling === calendar &&
            signature === lastSignature) {
            return;
        }

        installStyle();
        const list = ensureList(calendar);
        lastSignature = signature;

        list.innerHTML = '';

        const originalLinks = {};
        calendar.querySelectorAll('.fc-event[reclinkid]').forEach(function (link) {
            const id = link.getAttribute('reclinkid');
            if (!(id in originalLinks)) originalLinks[id] = link;
        });

        const groups = groupByDay(events, dates);
        const today = todayKey();

        dates.forEach(function (date) {
            list.appendChild(
                buildDay(date, groups[date] || [], today, originalLinks)
            );
        });
    }

    /* ------------------------------------------------------------------ */
    /* Spustenie                                                          */
    /* ------------------------------------------------------------------ */

    function scheduleUpdate() {
        clearTimeout(updateTimer);
        updateTimer = setTimeout(buildCalendar, 300);
    }

    function attachObserver() {
        const calendar = getCalendar();
        if (!calendar || calendar === observedCalendar) return;

        if (observer) observer.disconnect();

        observedCalendar = calendar;
        observer = new MutationObserver(scheduleUpdate);
        observer.observe(calendar, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-date']
        });
    }

    function start() {
        const calendar = getCalendar();
        const jq = getJq();

        if (!calendar || !jq) {
            setTimeout(start, 500);
            return;
        }

        // Tyzdenne zobrazenie vynutime len raz pri starte
        try {
            const view = jq(calendar).fullCalendar('getView');

            if (!view || view.name !== 'agendaWeek') {
                jq(calendar).fullCalendar('changeView', 'agendaWeek');
                setTimeout(start, 500);
                return;
            }
        } catch (error) {
            setTimeout(start, 500);
            return;
        }

        attachObserver();
        buildCalendar();

        // Lahka poistka: ak Zoho nahradi element kalendara, observer sa
        // pripoji znova. Bez zmeny dat sa nic neprekresluje.
        setInterval(function () {
            attachObserver();
            buildCalendar();
        }, 2000);

        document.addEventListener('visibilitychange', scheduleUpdate);
        window.addEventListener('orientationchange', scheduleUpdate);
    }

    removeAppBanner();
    installDarkMode();
    start();
})();
