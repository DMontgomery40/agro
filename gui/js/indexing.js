// AGRO GUI - Indexing Module
// Handles index operations and repo dropdown population

(function () {
    'use strict';

    const { api, $, state } = window.CoreUtils || {};

    if (!api || !$ || !state) {
        console.error('[indexing.js] CoreUtils not loaded!');
        return;
    }

    /**
     * Populate index repo dropdown with available repos
     */
    function populateIndexRepoDropdown() {
        const select = $('#index-repo-select');
        if (!select) return;

        const config = state.config;
        if (!config || !config.repos) {
            console.warn('[indexing] No config or repos available');
            return;
        }

        // Clear existing options
        select.innerHTML = '';

        // Add repos
        config.repos.forEach((repo) => {
            const opt = document.createElement('option');
            opt.value = repo.name;
            opt.textContent = repo.name;
            select.appendChild(opt);
        });

        // Set default selection
        if (config.env && config.env.REPO) {
            select.value = config.env.REPO;
        } else if (config.default_repo) {
            select.value = config.default_repo;
        } else if (config.repos.length > 0) {
            select.value = config.repos[0].name;
        }

        console.log('[indexing] Populated repo dropdown with', config.repos.length, 'repos');
    }

    /**
     * Refresh index overview stats
     */
    async function refreshIndexStats() {
        const grid = $('#index-overview-grid');
        if (!grid) return;

        try {
            const response = await fetch(api('/api/index/stats'));
            const stats = await response.json();

            // Build stats cards
            let html = '';

            // Total chunks
            html += `
                <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 6px; padding: 16px;">
                    <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">Total Chunks</div>
                    <div style="color: #00ff88; font-size: 24px; font-weight: 700; font-family: 'SF Mono', monospace;">
                        ${(stats.total_chunks || 0).toLocaleString()}
                    </div>
                </div>
            `;

            // Total size
            const totalSize = (stats.total_size_bytes || 0);
            const sizeGB = (totalSize / (1024 * 1024 * 1024)).toFixed(2);
            html += `
                <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 6px; padding: 16px;">
                    <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">Index Size</div>
                    <div style="color: #5b9dff; font-size: 24px; font-weight: 700; font-family: 'SF Mono', monospace;">
                        ${sizeGB} GB
                    </div>
                </div>
            `;

            // Repositories indexed
            html += `
                <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 6px; padding: 16px;">
                    <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">Repositories</div>
                    <div style="color: #ffa500; font-size: 24px; font-weight: 700; font-family: 'SF Mono', monospace;">
                        ${stats.repos_count || 0}
                    </div>
                </div>
            `;

            // Last indexed
            html += `
                <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 6px; padding: 16px;">
                    <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">Last Indexed</div>
                    <div style="color: #b794f6; font-size: 14px; font-weight: 600;">
                        ${stats.last_indexed || 'Never'}
                    </div>
                </div>
            `;

            grid.innerHTML = html;
        } catch (e) {
            console.error('[indexing] Failed to load stats:', e);
            grid.innerHTML = '<div style="color: #ff6b6b; padding: 16px;">Failed to load index stats</div>';
        }
    }

    /**
     * Initialize indexing UI
     */
    function initIndexing() {
        // Populate repo dropdown when config loads
        if (window.Config) {
            const originalLoadConfig = window.Config.loadConfig;
            window.Config.loadConfig = async function() {
                await originalLoadConfig.call(window.Config);
                populateIndexRepoDropdown();
            };
        }

        // Try to populate immediately if config already loaded
        if (state.config) {
            populateIndexRepoDropdown();
        }

        // Bind refresh button
        const refreshBtn = $('#btn-refresh-index-stats');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', refreshIndexStats);
        }

        // Initial stats load
        refreshIndexStats();

        console.log('[indexing] Initialized');
    }

    // Export to window
    window.Indexing = {
        initIndexing,
        populateIndexRepoDropdown,
        refreshIndexStats
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initIndexing);
    } else {
        initIndexing();
    }

    console.log('[indexing.js] Module loaded');
})();

