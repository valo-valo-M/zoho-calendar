// ==UserScript==
// @name         Zoho Calendar - mobilny tyzdenny prehlad
// @namespace    zoho-calendar-tools
// @version      1.1
// @description  Zvisly mobilny kalendar s povodnymi Zoho zaznamami
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

    function getCalendar() {
        return document.querySelector('#Kalendar_calendar');
    }

    function getDateKey(value) {
        if (!value) return '';

        if (typeof value.format === 'function') {
            return value.format('YYYY-MM-DD');
        }

        const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
        return match ? match[1] : '';
    }

    function formatDate(key) {
        const parts = key.split('-').map(Number);
        const date = new Date(parts[0], parts[1] - 1, parts[2]);

        return date.toLocaleDateString('sk-SK', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
    }

    function installStyle() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;

        style.textContent = `
            #${PANEL_ID} {
                width: 100%;
                box-sizing: border-box;
                padding: 8px 10px 24px;
                background: var(--app-background, #fff);
                color: var(--primary-text-color, #222);
            }

            #Kalendar_calendar .fc-view-container {
                display: none !important;
            }

            #Kalendar_calendar {
                height: auto !important;
                min-height: 0 !important;
            }

            #${PANEL_ID} .zmc-day {
                margin: 0 0 12px;
                border: 1px solid #d6d6d6;
                border-radius: 9px;
                overflow: hidden;
                background: var(--card-background-color, #fff);
            }

            #${PANEL_ID} .zmc-day-header {
                padding: 11px 12px;
                font-weight: 700;
                font-size: 15px;
                text-transform: capitalize;
                background: #eeeeee;
                color: #222;
            }

            #${PANEL_ID} .zmc-today .zmc-day-header {
                background: #d8edff;
            }

            #${PANEL_ID} .zmc-event {
                display: block;
                width: calc(100% - 16px);
                box-sizing: border-box;
                margin: 8px;
                padding: 12px;
                border: 0;
                border-left: 6px solid #00c90d;
                border-radius: 6px;
                background: #e8f7e9;
                color: #111;
                text-align: left;
                font-size: 15px;
                font-weight: 600;
                line-height: 1.35;
                cursor: pointer;
                overflow-wrap: anywhere;
            }

            #${PANEL_ID} .zmc-empty {
                padding: 10px 12px;
                color: #888;
                font-size: 13px;
            }

            #${PANEL_ID} .zmc-error {
                padding: 12px;
                color: #b00020;
            }
        `;

        document.head.appendChild(style);
    }

    function buildCalendar() {
        const calendar = getCalendar();
        if (!calendar) return;

        const jq = window.jQuery || window.$;

        if (!jq || !jq.fn || !jq.fn.fullCalendar) return;

        let events;

        try {
            events = jq(calendar).fullCalendar('clientEvents');
        } catch (error) {
            showError('Nepodarilo sa načítať udalosti: ' + error.message);
            return;
        }

        const headers = Array.from(
            calendar.querySelectorAll('th.fc-day-header[data-date]')
        );

        const dates = headers
            .map(header => header.getAttribute('data-date'))
            .filter(Boolean);

        if (!dates.length) {
            showError('Nenašli sa dátumy. Prepnite kalendár na týždenné zobrazenie.');
            return;
        }

        installStyle();

        let panel = document.getElementById(PANEL_ID);

        if (!panel) {
            panel = document.createElement('div');
            panel.id = PANEL_ID;
            calendar.insertAdjacentElement('afterend', panel);
        }

        panel.innerHTML = '';

        const originalLinks = {};

        calendar.querySelectorAll('.fc-event[reclinkid]').forEach(link => {
            originalLinks[link.getAttribute('reclinkid')] = link;
        });

        const eventGroups = {};

        dates.forEach(date => {
            eventGroups[date] = [];
        });

        (events || []).forEach(event => {
            const date = getDateKey(event.start);

            if (eventGroups[date]) {
                eventGroups[date].push(event);
            }
        });

        const today = new Date();
        const todayKey = [
            today.getFullYear(),
            String(today.getMonth() + 1).padStart(2, '0'),
            String(today.getDate()).padStart(2, '0')
        ].join('-');

        dates.forEach(date => {
            const day = document.createElement('section');
            day.className = 'zmc-day' +
                (date === todayKey ? ' zmc-today' : '');

            const heading = document.createElement('div');
            heading.className = 'zmc-day-header';
            heading.textContent = formatDate(date);

            day.appendChild(heading);

            const dayEvents = eventGroups[date] || [];

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
                button.textContent = title;

                if (event.backgroundColor) {
                    button.style.borderLeftColor = event.backgroundColor;
                }

                button.addEventListener('click', function () {
                    const original = originalLinks[id];

                    if (original) {
                        original.click();
                    } else {
                        alert('Pôvodný odkaz na záznam sa nenašiel. ID: ' + id);
                    }
                });

                day.appendChild(button);
            });

            panel.appendChild(day);
        });
    }

    function showError(message) {
        const calendar = getCalendar();
        if (!calendar) return;

        let panel = document.getElementById(PANEL_ID);

        if (!panel) {
            panel = document.createElement('div');
            panel.id = PANEL_ID;
            calendar.insertAdjacentElement('afterend', panel);
        }

        panel.innerHTML = '';

        const error = document.createElement('div');
        error.className = 'zmc-error';
        error.textContent = message;
        panel.appendChild(error);
    }

    let updateTimer;

    function scheduleUpdate() {
        clearTimeout(updateTimer);
        updateTimer = setTimeout(buildCalendar, 300);
    }

    function start() {
        const calendar = getCalendar();

        if (!calendar) {
            setTimeout(start, 500);
            return;
        }

        buildCalendar();

        const observer = new MutationObserver(scheduleUpdate);

        observer.observe(calendar, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-date']
        });

        // Záložná kontrola pri zmene týždňa alebo filtra.
        setInterval(buildCalendar, 3000);
    }

    start();
})();
