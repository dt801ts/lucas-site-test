document.addEventListener('DOMContentLoaded', function() {
    const normalize = function(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    };

    const tokenize = function(value) {
        return normalize(value).split(/\s+/).filter(Boolean);
    };

    const escapeHTML = function(value) {
        const span = document.createElement('span');
        span.textContent = value == null ? '' : String(value);
        return span.innerHTML;
    };

    const asArray = function(value) {
        return Array.isArray(value) ? value : [];
    };

    const searchableText = function(item, includeContent) {
        const parts = [
            item.title,
            item.date,
            item.dateISO,
            item.location,
            item.summary,
            asArray(item.tags).join(' '),
            asArray(item.categories).join(' ')
        ];

        if (includeContent) {
            parts.push(item.content);
        }

        return normalize(parts.join(' '));
    };

    const matchesTokens = function(item, tokens, includeContent) {
        const haystack = searchableText(item, includeContent);
        return tokens.every(function(token) {
            return haystack.includes(token);
        });
    };

    const scoreItem = function(item, tokens, includeContent) {
        const title = normalize(item.title);
        const tags = normalize(asArray(item.tags).join(' '));
        const categories = normalize(asArray(item.categories).join(' '));
        const summary = normalize(item.summary);
        const content = includeContent ? normalize(item.content) : '';
        let score = 0;

        tokens.forEach(function(token) {
            if (title.startsWith(token)) score += 30;
            if (title.includes(token)) score += 24;
            if (tags.includes(token)) score += 18;
            if (categories.includes(token)) score += 14;
            if (summary.includes(token)) score += 8;
            if (content.includes(token)) score += 3;
        });

        return score;
    };

    const sortResults = function(a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return String(b.item.dateISO || '').localeCompare(String(a.item.dateISO || ''));
    };

    const menuToggle = document.querySelector('.site-menu-toggle');
    const siteMenu = document.querySelector('.site-menu');

    if (menuToggle && siteMenu) {
        const isMenuOpen = function() {
            return menuToggle.getAttribute('aria-expanded') === 'true';
        };

        const setMenuOpen = function(open, options) {
            const settings = options || {};

            if (open) {
                siteMenu.scrollTop = 0;
            }

            menuToggle.classList.toggle('close', open);
            siteMenu.classList.toggle('toggled', open);
            menuToggle.setAttribute('aria-expanded', String(open));
            siteMenu.setAttribute('aria-hidden', String(!open));

            if (open) {
                siteMenu.removeAttribute('inert');
            } else {
                siteMenu.setAttribute('inert', '');
            }

            if (!open && settings.restoreFocus) {
                menuToggle.focus();
            }
        };

        setMenuOpen(false);

        menuToggle.addEventListener('click', function() {
            setMenuOpen(!isMenuOpen());
        });

        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' && isMenuOpen()) {
                setMenuOpen(false, { restoreFocus: true });
            }
        });
    }

    const menuSearchForm = document.querySelector('.site-menu__search-form[data-search-meta-url]');

    if (menuSearchForm) {
        const input = menuSearchForm.querySelector('.search-input');
        const panel = document.querySelector('.site-menu__search-results');
        const status = panel ? panel.querySelector('.site-menu__search-status') : null;
        const list = panel ? panel.querySelector('.site-menu__search-list') : null;
        const metaUrl = menuSearchForm.getAttribute('data-search-meta-url');
        let metaPromise;

        const loadMeta = function() {
            if (!metaPromise) {
                metaPromise = fetch(metaUrl, { credentials: 'same-origin' })
                    .then(function(response) {
                        if (!response.ok) throw new Error('Search metadata unavailable');
                        return response.json();
                    });
            }
            return metaPromise;
        };

        const clearMenuResults = function() {
            if (!panel || !status || !list) return;
            panel.hidden = true;
            status.textContent = '';
            list.innerHTML = '';
        };

        const fullSearchUrl = function(query) {
            const url = new URL(menuSearchForm.getAttribute('action') || '/search/', window.location.origin);
            url.searchParams.set('q', query);
            return url.pathname + url.search;
        };

        const setMenuSearchStatus = function(prefix, query) {
            if (!status) return;

            const summary = document.createElement('span');
            summary.className = 'search-status__summary';
            summary.textContent = prefix;

            const link = document.createElement('a');
            link.className = 'search-status__link';
            link.href = fullSearchUrl(query);
            link.setAttribute('aria-label', 'Full search for ' + query);
            link.innerHTML = '<svg class="search-status__svg" viewBox="0 0 24 24" focusable="false" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="M15.5 15.5 21 21"></path></svg><span class="search-status__label">Full search</span>';

            status.textContent = '';
            status.append(summary);
            status.append(link);
        };

        const menuDateHTML = function(date) {
            const parts = String(date || '').trim().split(/\s+/).filter(Boolean);
            if (parts.length >= 3) {
                return '<span class="site-menu__search-result-date-line">' + escapeHTML(parts.slice(0, -1).join(' ')) + '</span>' +
                    '<span class="site-menu__search-result-date-line">' + escapeHTML(parts[parts.length - 1]) + '</span>';
            }
            return '<span class="site-menu__search-result-date-line">' + escapeHTML(parts.join(' ')) + '</span>';
        };

        const renderMenuResults = function(items, query) {
            if (!panel || !status || !list) return;
            const tokens = tokenize(query);

            if (!tokens.length) {
                clearMenuResults();
                return;
            }

            const results = items
                .filter(function(item) { return matchesTokens(item, tokens, false); })
                .map(function(item) {
                    return { item: item, score: scoreItem(item, tokens, false) };
                })
                .sort(sortResults);

            panel.hidden = false;
            list.innerHTML = '';

            if (!results.length) {
                setMenuSearchStatus('No quick matches.', query);
                return;
            }

            setMenuSearchStatus(results.length === 1
                ? '1 quick match.'
                : results.length + ' quick matches.', query);

            results.slice(0, 8).forEach(function(result) {
                const item = result.item;
                const li = document.createElement('li');
                li.innerHTML = '<a class="site-menu__search-result" href="' + escapeHTML(item.url) + '">' +
                    '<span class="site-menu__search-result-date">' + menuDateHTML(item.date) + '</span>' +
                    '<span class="site-menu__search-result-title">' + escapeHTML(item.title || '') + '</span>' +
                    '</a>';
                list.appendChild(li);
            });
        };

        if (input && metaUrl) {
            input.addEventListener('input', function() {
                const query = input.value;
                if (!tokenize(query).length) {
                    clearMenuResults();
                    return;
                }

                loadMeta()
                    .then(function(items) { renderMenuResults(items, query); })
                    .catch(function() {
                        if (panel && status) {
                            panel.hidden = false;
                            status.textContent = 'Search metadata could not be loaded.';
                        }
                    });
            });

            input.addEventListener('focus', function() {
                if (tokenize(input.value).length) {
                    loadMeta().then(function(items) { renderMenuResults(items, input.value); }).catch(function() {});
                }
            });
        }
    }

    const searchPage = document.querySelector('.search-page[data-search-full-url]');

    if (searchPage) {
        const form = searchPage.querySelector('.search-page__form');
        const input = searchPage.querySelector('.search-page__input');
        const status = searchPage.querySelector('.search-page__status');
        const resultsList = searchPage.querySelector('.search-page__results');
        const fullUrl = searchPage.getAttribute('data-search-full-url');
        let fullPromise;
        let debounceTimer;

        const loadFull = function() {
            if (!fullPromise) {
                fullPromise = fetch(fullUrl, { credentials: 'same-origin' })
                    .then(function(response) {
                        if (!response.ok) throw new Error('Search index unavailable');
                        return response.json();
                    });
            }
            return fullPromise;
        };

        const snippetFor = function(item, tokens) {
            const content = String(item.content || item.summary || '');
            const normalContent = normalize(content);
            let index = -1;

            tokens.some(function(token) {
                index = normalContent.indexOf(token);
                return index !== -1;
            });

            if (index === -1) {
                return String(item.summary || '').slice(0, 220);
            }

            const start = Math.max(0, index - 80);
            const end = Math.min(content.length, index + 180);
            return (start > 0 ? '…' : '') + content.slice(start, end).trim() + (end < content.length ? '…' : '');
        };

        const updateSearchUrl = function(query) {
            const trimmedQuery = String(query || '').trim();
            const url = new URL(window.location.href);

            if (trimmedQuery) {
                url.searchParams.set('q', trimmedQuery);
            } else {
                url.searchParams.delete('q');
            }

            window.history.replaceState({}, '', url);
        };

        const setFullSearchStatus = function(message) {
            status.textContent = message || '';
            status.hidden = !message;
        };

        const renderFullResults = function(items, query) {
            const tokens = tokenize(query);
            const displayQuery = String(query || '').trim();

            if (!tokens.length) {
                setFullSearchStatus('');
                resultsList.innerHTML = '';
                return;
            }

            const results = items
                .filter(function(item) { return matchesTokens(item, tokens, true); })
                .map(function(item) {
                    return { item: item, score: scoreItem(item, tokens, true) };
                })
                .sort(sortResults);

            resultsList.innerHTML = '';

            if (!results.length) {
                setFullSearchStatus('No results for “' + displayQuery + '.”');
                return;
            }

            setFullSearchStatus(results.length === 1
                ? '1 result for “' + displayQuery + '.”'
                : results.length + ' results for “' + displayQuery + '.”');

            results.slice(0, 50).forEach(function(result) {
                const item = result.item;
                const li = document.createElement('li');
                li.className = 'search-page__result';
                li.innerHTML = '<h2 class="search-page__result-title"><a href="' + escapeHTML(item.url) + '">' + escapeHTML(item.title || '') + '</a></h2>' +
                    '<p class="search-page__result-meta">' + escapeHTML(item.date || '') + (item.location ? ' · ' + escapeHTML(item.location) : '') + '</p>' +
                    '<p class="search-page__result-snippet">' + escapeHTML(snippetFor(item, tokens)) + '</p>';
                resultsList.appendChild(li);
            });
        };

        const runFullSearch = function(query, updateUrl) {
            if (updateUrl) {
                updateSearchUrl(query);
            }

            if (!tokenize(query).length) {
                renderFullResults([], '');
                return;
            }

            setFullSearchStatus('Searching…');
            loadFull()
                .then(function(items) {
                    renderFullResults(items, query);
                })
                .catch(function() {
                    setFullSearchStatus('The search index could not be loaded.');
                });
        };

        if (form && input && status && resultsList && fullUrl) {
            const initialQuery = new URLSearchParams(window.location.search).get('q') || '';
            input.value = initialQuery;
            runFullSearch(initialQuery, false);

            form.addEventListener('submit', function(event) {
                event.preventDefault();
                runFullSearch(input.value, true);
            });

            input.addEventListener('input', function() {
                window.clearTimeout(debounceTimer);
                debounceTimer = window.setTimeout(function() {
                    runFullSearch(input.value, true);
                }, 140);
            });
        }
    }
});
