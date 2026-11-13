// ==UserScript==
// @name         Zoho Calendar - mobilny tyzdenny prehlad
// @namespace    zoho-calendar-tools
// @version      1.5
// @description  Zvisly mobilny kalendar (iPhone Safari) s povodnymi Zoho zaznamami
// @match        https://creatorapp.zoho.com/michalbokovi/service-system/*
// @run-at       document-idle
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

    function formatDate(key) {
        const p = key.split('-').map(Number);
        return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('sk-SK', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
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
                width: 100%;
                box-sizing: border-box;
                padding: 4px 6px 12px;
                background: var(--app-background, #fff);
                color: var(--primary-text-color, #222);
                -webkit-text-size-adjust: 100%;
            }

            #${PANEL_ID} .zmc-day {
                margin: 0 0 6px;
                border: 1px solid #d6d6d6;
                border-radius: 6px;
                overflow: hidden;
                background: var(--card-background-color, #fff);
            }

            #${PANEL_ID} .zmc-day-header {
                padding: 6px 9px;
                font-weight: 700;
                font-size: 13px;
                text-transform: capitalize;
                background: #eeeeee;
                color: #222;
            }

            #${PANEL_ID} .zmc-today .zmc-day-header {
                background: #d8edff;
            }

            #${PANEL_ID} .zmc-event {
                display: block;
                width: calc(100% - 12px);
                box-sizing: border-box;
                margin: 5px 6px;
                padding: 8px 9px;
                border: 0;
                border-left: 4px solid #00c90d;
                border-radius: 4px;
                background: #e8f7e9;
                color: #111;
                text-align: left;
                font-family: inherit;
                font-size: 13px;
                font-weight: 600;
                line-height: 1.25;
                cursor: pointer;
                overflow-wrap: anywhere;
                -webkit-appearance: none;
                appearance: none;
                -webkit-tap-highlight-color: transparent;
            }

            #${PANEL_ID} .zmc-time {
                font-weight: 700;
                margin-right: 4px;
                white-space: nowrap;
            }

            #${PANEL_ID} .zmc-empty {
                padding: 6px 9px;
                color: #888;
                font-size: 12px;
            }

            #${PANEL_ID} .zmc-error {
                padding: 10px;
                color: #b00020;
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
            const day = document.createElement('section');
            day.className = 'zmc-day' + (date === today ? ' zmc-today' : '');

            const heading = document.createElement('div');
            heading.className = 'zmc-day-header';
            heading.textContent = formatDate(date);
            day.appendChild(heading);

            const dayEvents = groups[date] || [];

            if (!dayEvents.length) {
                const empty = document.createElement('div');
                empty.className = 'zmc-empty';
                empty.textContent = 'Bez udalostí';
                day.appendChild(empty);
            }

            dayEvents.forEach(event => {
                const id = String(event.id || event._id || '');
                const title = event.title || event.description || 'Udalosť';

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'zmc-event';

                if (!event.allDay && event.start && event.start.hasTime && event.start.hasTime()) {
                    const time = document.createElement('span');
                    time.className = 'zmc-time';
                    time.textContent = event.start.format('HH:mm');
                    button.appendChild(time);
                }

                button.appendChild(document.createTextNode(title));

                if (event.backgroundColor) {
                    button.style.borderLeftColor = event.backgroundColor;
                }

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

                day.appendChild(button);
            });

            panel.appendChild(day);
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

        // Lahka poistka: ak Zoho prekresli cely kalendar (nahradi element),
        // znova pripojime observer. buildCalendar sa bez zmeny nic nekresli.
        setInterval(function () {
            attachObserver();
            buildCalendar();
        }, 2000);

        // Po navrate do aplikacie / otoceni telefonu
        document.addEventListener('visibilitychange', scheduleUpdate);
        window.addEventListener('orientationchange', scheduleUpdate);
    }

    start();
})();