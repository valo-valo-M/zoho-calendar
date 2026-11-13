// ==UserScript==
// @name         Zoho Calendar - mobilny tyzdenny prehlad
// @namespace    zoho-calendar-tools
// @version      1.9
// @description  Zvisly mobilny kalendar (iPhone Safari) s povodnymi Zoho zaznamami
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
    const PANEL_ID = 'zoho-mobile-calendar';
    const DARK_STYLE_ID = 'zoho-mobile-calendar-dark';

    // true = cela stranka Zoho v tmavom rezime, false = povodny svetly vzhlad
    const DARK_MODE = true;

    // Tmavy rezim cez invertovanie farieb celej stranky (Zoho nema vlastny
    // tmavy rezim). Obrazky, video a nas panel sa invertuju spat, takze
    // zostanu v peknych farbach.
    function installDarkMode() {
        if (!DARK_MODE) return;

        const root = document.documentElement;
        root.classList.add('zmc-dark');

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

    let lastSignature = '';
    let observedCalendar = null;
    let observer = null;
    let updateTimer = null;

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
                --zmc-bg: #ffffff;
                --zmc-text: #1c1c1e;
                --zmc-muted: #8e8e93;
                --zmc-line: #e5e5ea;
                --zmc-label-bg: #f2f2f7;
                --zmc-accent: #007aff;
                --zmc-accent-text: #ffffff;
                --zmc-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);

                width: 100%;
                box-sizing: border-box;
                padding: 6px max(8px, env(safe-area-inset-right))
                         calc(14px + env(safe-area-inset-bottom))
                         max(8px, env(safe-area-inset-left));
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text",
                             "Helvetica Neue", Arial, sans-serif;
                color: var(--zmc-text);
                -webkit-text-size-adjust: 100%;
                -webkit-font-smoothing: antialiased;
            }

            html.zmc-dark #${PANEL_ID} {
                --zmc-bg: #1c1c1e;
                --zmc-text: #f2f2f7;
                --zmc-muted: #98989f;
                --zmc-line: #38383a;
                --zmc-label-bg: #2c2c2e;
                --zmc-accent: #0a84ff;
                --zmc-shadow: none;
            }

            html.zmc-dark #${PANEL_ID} .zmc-event::before {
                opacity: 0.28;
            }

            #${PANEL_ID} * {
                box-sizing: border-box;
            }

            /* ---- Den ---- */
            #${PANEL_ID} .zmc-day {
                display: flex;
                align-items: stretch;
                margin: 0 0 8px;
                background: var(--zmc-bg);
                border: 1px solid var(--zmc-line);
                border-radius: 14px;
                overflow: hidden;
                box-shadow: var(--zmc-shadow);
            }

            #${PANEL_ID} .zmc-today {
                border-color: var(--zmc-accent);
                box-shadow: 0 0 0 1px var(--zmc-accent);
            }

            /* Lavy stlpec s datumom */
            #${PANEL_ID} .zmc-date {
                flex: 0 0 52px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 8px 0;
                background: var(--zmc-label-bg);
                text-align: center;
                line-height: 1.1;
            }

            #${PANEL_ID} .zmc-wd {
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.04em;
                text-transform: uppercase;
                color: var(--zmc-muted);
            }

            #${PANEL_ID} .zmc-num {
                margin: 3px 0 2px;
                min-width: 30px;
                height: 30px;
                line-height: 30px;
                border-radius: 15px;
                font-size: 19px;
                font-weight: 700;
                color: var(--zmc-text);
            }

            #${PANEL_ID} .zmc-mon {
                font-size: 10px;
                color: var(--zmc-muted);
            }

            #${PANEL_ID} .zmc-today .zmc-wd {
                color: var(--zmc-accent);
            }

            #${PANEL_ID} .zmc-today .zmc-num {
                background: var(--zmc-accent);
                color: var(--zmc-accent-text);
            }

            #${PANEL_ID} .zmc-weekend .zmc-wd,
            #${PANEL_ID} .zmc-weekend .zmc-num {
                color: #ff3b30;
            }

            #${PANEL_ID} .zmc-today.zmc-weekend .zmc-num {
                color: var(--zmc-accent-text);
            }

            /* Pravy stlpec s udalostami */
            #${PANEL_ID} .zmc-events {
                flex: 1 1 auto;
                min-width: 0;
                padding: 6px;
                display: flex;
                flex-direction: column;
                justify-content: center;
                gap: 6px;
            }

            #${PANEL_ID} .zmc-empty {
                padding: 6px 4px;
                font-size: 13px;
                color: var(--zmc-muted);
            }

            /* Prazdny den je nizsi a tlmeny */
            #${PANEL_ID} .zmc-day.zmc-none .zmc-date {
                flex-basis: 52px;
                flex-direction: row;
                gap: 5px;
                padding: 6px 0;
            }

            #${PANEL_ID} .zmc-day.zmc-none .zmc-num {
                margin: 0;
                height: 26px;
                line-height: 26px;
                min-width: 26px;
                border-radius: 13px;
                font-size: 16px;
            }

            #${PANEL_ID} .zmc-day.zmc-none .zmc-mon {
                display: none;
            }

            #${PANEL_ID} .zmc-day.zmc-none .zmc-events {
                padding: 0 6px;
            }

            #${PANEL_ID} .zmc-day.zmc-none:not(.zmc-today) {
                box-shadow: none;
                background: transparent;
            }

            #${PANEL_ID} .zmc-past .zmc-events {
                opacity: 0.6;
            }

            /* ---- Udalost ---- */
            #${PANEL_ID} .zmc-event {
                --c: #34c759;

                position: relative;
                display: block;
                width: 100%;
                min-height: 46px;
                margin: 0;
                padding: 7px 10px 7px 13px;
                border: 0;
                border-radius: 10px;
                background: transparent;
                color: var(--zmc-text);
                text-align: left;
                font-family: inherit;
                cursor: pointer;
                overflow: hidden;
                -webkit-appearance: none;
                appearance: none;
                -webkit-tap-highlight-color: transparent;
                touch-action: manipulation;
            }

            #${PANEL_ID} .zmc-event::before {
                content: "";
                position: absolute;
                inset: 0;
                background: var(--c);
                opacity: 0.16;
                pointer-events: none;
            }

            #${PANEL_ID} .zmc-event::after {
                content: "";
                position: absolute;
                left: 0;
                top: 0;
                bottom: 0;
                width: 4px;
                background: var(--c);
                pointer-events: none;
            }

            #${PANEL_ID} .zmc-event:active {
                transform: scale(0.985);
            }

            #${PANEL_ID} .zmc-event > * {
                position: relative;
                z-index: 1;
            }

            #${PANEL_ID} .zmc-time {
                display: block;
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.02em;
                text-transform: uppercase;
                color: var(--zmc-muted);
                margin-bottom: 2px;
            }

            #${PANEL_ID} .zmc-title {
                display: -webkit-box;
                -webkit-box-orient: vertical;
                -webkit-line-clamp: 3;
                overflow: hidden;
                font-size: 14.5px;
                font-weight: 600;
                line-height: 1.25;
                overflow-wrap: anywhere;
            }

            #${PANEL_ID} .zmc-error {
                padding: 12px;
                color: #ff3b30;
                font-size: 14px;
            }
        `;
        document.head.appendChild(style);
    }

    function getPanel(calendar) {
        let panel = document.getElementById(PANEL_ID);

        if (!panel) {
            panel = document.createElement('div');
            panel.id = PANEL_ID;
            calendar.insertAdjacentElement('afterend', panel);
        }

        return panel;
    }

    function showError(message) {
        const calendar = getCalendar();
        if (!calendar) return;

        installStyle();
        const panel = getPanel(calendar);
        panel.innerHTML = '';

        const error = document.createElement('div');
        error.className = 'zmc-error';
        error.textContent = message;
        panel.appendChild(error);

        lastSignature = '';
    }

    // Rozdelenie udalosti do dni (vratane viacdnovych). End je exkluzivny.
    function groupByDay(events, dates) {
        const groups = {};
        dates.forEach(d => { groups[d] = []; });

        events.forEach(ev => {
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

        Object.keys(groups).forEach(key => {
            groups[key].sort((a, b) => a.start.valueOf() - b.start.valueOf());
        });

        return groups;
    }

    function timeLabel(event, date) {
        if (event.start.format('YYYY-MM-DD') !== date) return 'pokračuje';
        if (event.allDay) return 'celý deň';
        if (event.start.hasTime && event.start.hasTime()) {
            const start = event.start.format('HH:mm');
            const sameDay = event.end &&
                event.end.format('YYYY-MM-DD') === date;
            return sameDay ? start + ' – ' + event.end.format('HH:mm') : start;
        }
        return '';
    }

    function buildDay(date, dayEvents, today, originalLinks) {
        const dateObj = parseKey(date);
        const dow = dateObj.getDay();

        const day = document.createElement('section');
        day.className = 'zmc-day' +
            (date === today ? ' zmc-today' : '') +
            (date < today ? ' zmc-past' : '') +
            (dow === 0 || dow === 6 ? ' zmc-weekend' : '') +
            (!dayEvents.length ? ' zmc-none' : '');

        // Datum
        const label = document.createElement('div');
        label.className = 'zmc-date';

        const wd = document.createElement('div');
        wd.className = 'zmc-wd';
        wd.textContent = dateObj.toLocaleDateString('sk-SK', { weekday: 'short' })
            .replace('.', '');

        const num = document.createElement('div');
        num.className = 'zmc-num';
        num.textContent = String(dateObj.getDate());

        const mon = document.createElement('div');
        mon.className = 'zmc-mon';
        mon.textContent = dateObj.toLocaleDateString('sk-SK', { month: 'short' })
            .replace('.', '');

        label.appendChild(wd);
        label.appendChild(num);
        label.appendChild(mon);
        day.appendChild(label);

        // Udalosti
        const list = document.createElement('div');
        list.className = 'zmc-events';

        if (!dayEvents.length) {
            const empty = document.createElement('div');
            empty.className = 'zmc-empty';
            empty.textContent = 'Bez udalostí';
            list.appendChild(empty);
        }

        dayEvents.forEach(event => {
            const id = String(event.id || event._id || '');
            const title = event.title || event.description || 'Udalosť';

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'zmc-event';

            if (event.backgroundColor) {
                button.style.setProperty('--c', event.backgroundColor);
            }

            const time = timeLabel(event, date);

            if (time) {
                const t = document.createElement('span');
                t.className = 'zmc-time';
                t.textContent = time;
                button.appendChild(t);
            }

            const name = document.createElement('span');
            name.className = 'zmc-title';
            name.textContent = title;
            button.appendChild(name);

            button.addEventListener('click', function () {
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

            list.appendChild(button);
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
            .map(h => h.getAttribute('data-date'))
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
            events.map(e => [
                e.id || e._id,
                e.title,
                e.start && e.start.format(),
                e.end && e.end.format(),
                e.allDay,
                e.backgroundColor
            ])
        ]);

        if (existing && signature === lastSignature) return;
        lastSignature = signature;

        installStyle();
        const panel = getPanel(calendar);
        panel.innerHTML = '';

        const originalLinks = {};
        calendar.querySelectorAll('.fc-event[reclinkid]').forEach(link => {
            const id = link.getAttribute('reclinkid');
            if (!(id in originalLinks)) originalLinks[id] = link;
        });

        const groups = groupByDay(events, dates);
        const today = todayKey();

        dates.forEach(date => {
            panel.appendChild(
                buildDay(date, groups[date] || [], today, originalLinks)
            );
        });
    }

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

    installDarkMode();
    start();
})();