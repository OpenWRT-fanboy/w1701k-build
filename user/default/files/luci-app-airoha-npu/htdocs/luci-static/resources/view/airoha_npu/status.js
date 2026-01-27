'use strict';
'require view';
'require poll';
'require rpc';
'require ui';

var callNpuStatus = rpc.declare({
	object: 'luci.airoha_npu',
	method: 'getStatus'
});

var callPpeEntries = rpc.declare({
	object: 'luci.airoha_npu',
	method: 'getPpeEntries'
});

var callTokenInfo = rpc.declare({
	object: 'luci.airoha_npu',
	method: 'getTokenInfo'
});

var callSetGovernor = rpc.declare({
	object: 'luci.airoha_npu',
	method: 'setGovernor',
	params: ['governor']
});

var callSetMaxFreq = rpc.declare({
	object: 'luci.airoha_npu',
	method: 'setMaxFreq',
	params: ['freq']
});

var callSetOverclock = rpc.declare({
	object: 'luci.airoha_npu',
	method: 'setOverclock',
	params: ['freq_mhz']
});

var bandInfo = [
	{ name: '2.4 GHz', accent: '#ff9800' },
	{ name: '5 GHz', accent: '#2196f3' },
	{ name: '6 GHz', accent: '#9c27b0' }
];

function formatFreqMHz(khz) {
	if (!khz || khz === 0) return 'N/A';
	return (khz / 1000).toFixed(0) + ' MHz';
}

function calcTotalMemory(memRegions) {
	var totalMemory = 0;
	memRegions.forEach(function(region) {
		var sizeStr = region.size || '';
		var match = sizeStr.match(/(\d+)\s*(KiB|MiB|GiB|KB|MB|GB)/i);
		if (match) {
			var size = parseInt(match[1]);
			var unit = match[2].toUpperCase();
			if (unit === 'KIB' || unit === 'KB') totalMemory += size;
			else if (unit === 'MIB' || unit === 'MB') totalMemory += size * 1024;
			else if (unit === 'GIB' || unit === 'GB') totalMemory += size * 1024 * 1024;
		}
	});
	return totalMemory >= 1024 ? (totalMemory / 1024).toFixed(0) + ' MiB' : totalMemory + ' KiB';
}

function tokenHealth(count, size) {
	if (size === 0) return { text: 'N/A', color: '#888' };
	var pct = count / size * 100;
	if (pct < 50) return { text: 'Healthy', color: '#4caf50' };
	if (pct < 80) return { text: 'Warning', color: '#ff9800' };
	return { text: 'Critical', color: '#f44336' };
}

function getBandStats(tokenInfo, band) {
	var counts = Array.isArray(tokenInfo.station_counts) ? tokenInfo.station_counts : [];
	for (var i = 0; i < counts.length; i++) {
		if (counts[i].band === band) return counts[i];
	}
	return { band: band, count: 0, tx_packets: 0, tx_retries: 0, tx_failed: 0 };
}

function getTxQueue(tokenInfo, band) {
	var queues = Array.isArray(tokenInfo.tx_queues) ? tokenInfo.tx_queues : [];
	for (var i = 0; i < queues.length; i++) {
		if (queues[i].band === band) return queues[i];
	}
	return null;
}

function bandHealth(stats) {
	if (!stats || stats.count === 0) return { text: 'No clients', color: '#888' };
	if (stats.tx_packets === 0) return { text: 'Idle', color: '#888' };
	// retry rate = retries / (packets + retries) (fraction of air frames that are retransmits)
	var retryRate = stats.tx_retries / (stats.tx_packets + stats.tx_retries);
	if (retryRate > 0.5) return { text: 'Poor', color: '#f44336' };
	if (retryRate > 0.2) return { text: 'Fair', color: '#ff9800' };
	return { text: 'Good', color: '#4caf50' };
}

function retryRatePct(stats) {
	if (!stats || stats.tx_packets === 0) return '-';
	var rate = stats.tx_retries / (stats.tx_packets + stats.tx_retries) * 100;
	return rate.toFixed(1) + '%';
}

function renderBandCard(band, txQueue, stats) {
	var info = bandInfo[band] || { name: 'Band ' + band, accent: '#888' };
	var id = 'band-' + band;
	var type = txQueue ? txQueue.type : 'unknown';
	var health = bandHealth(stats);

	var pathBadge;
	if (type === 'npu') {
		pathBadge = E('span', { 'style': 'background:#1565c0;color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600' }, 'NPU');
	} else if (type === 'dma') {
		pathBadge = E('span', { 'style': 'background:#555;color:#ccc;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600' }, 'DMA');
	} else {
		pathBadge = E('span', { 'style': 'background:#333;color:#888;padding:2px 8px;border-radius:4px;font-size:11px' }, '?');
	}

	var statsRows = [];
	if (stats && stats.count > 0 && stats.tx_packets > 0) {
		var retryPct = retryRatePct(stats);
		var rr = stats.tx_retries / (stats.tx_packets + stats.tx_retries);
		var retryColor = rr > 0.5 ? '#f44336' : rr > 0.2 ? '#ff9800' : '#aaa';
		statsRows = [
			E('div', { 'style': 'display:flex;justify-content:space-between;font-size:12px;color:#aaa;margin-top:2px' }, [
				E('span', {}, 'Retries'),
				E('span', { 'id': id + '-retries', 'style': 'color:' + retryColor }, retryPct)
			])
		];
	}

	return E('div', {
		'id': id,
		'style': 'background:#1e1e1e;border-radius:8px;padding:16px;border:1px solid #333;border-left:3px solid ' + info.accent
	}, [
		E('div', { 'style': 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px' }, [
			E('span', { 'style': 'font-size:16px;font-weight:bold;color:#fff' }, info.name),
			pathBadge
		]),
		E('div', { 'style': 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px' }, [
			E('div', { 'id': id + '-health', 'style': 'display:flex;align-items:center;gap:6px' }, [
				E('span', { 'style': 'width:8px;height:8px;border-radius:50%;background:' + health.color + ';display:inline-block' }),
				E('span', { 'style': 'color:' + health.color + ';font-size:13px;font-weight:500' }, health.text)
			]),
			E('span', { 'id': id + '-clients', 'style': 'color:#aaa;font-size:13px' },
				stats.count + ' client' + (stats.count !== 1 ? 's' : ''))
		])
	].concat(statsRows));
}

function updateBandCard(band, stats) {
	var id = 'band-' + band;
	var health = bandHealth(stats);

	var healthEl = document.getElementById(id + '-health');
	if (healthEl) {
		healthEl.innerHTML = '';
		healthEl.appendChild(E('span', { 'style': 'width:8px;height:8px;border-radius:50%;background:' + health.color + ';display:inline-block' }));
		healthEl.appendChild(E('span', { 'style': 'color:' + health.color + ';font-size:13px;font-weight:500' }, health.text));
	}

	var clientsEl = document.getElementById(id + '-clients');
	if (clientsEl) {
		clientsEl.textContent = stats.count + ' client' + (stats.count !== 1 ? 's' : '');
	}

	var retriesEl = document.getElementById(id + '-retries');
	if (retriesEl) {
		var retryPct = retryRatePct(stats);
		retriesEl.textContent = retryPct;
		var rr = stats.tx_packets > 0 ? stats.tx_retries / (stats.tx_packets + stats.tx_retries) : 0;
		retriesEl.style.color = rr > 0.5 ? '#f44336' : rr > 0.2 ? '#ff9800' : '#aaa';
	}
}

function freqBarState(hwFreq, minFreq, maxFreq, pllFreqMhz, governor) {
	// Only trust PLL register reading when governor is "performance" (PLL is stable).
	// During dynamic scaling (ondemand/schedutil), devmem reads race with PLL transitions
	// and produce garbage values (e.g. 1800-1900 MHz).
	var isOverclocked = governor === 'performance' && pllFreqMhz > 0 && (pllFreqMhz * 1000) > maxFreq;
	var displayMax = isOverclocked ? pllFreqMhz * 1000 : maxFreq;
	var displayFreq = isOverclocked ? pllFreqMhz * 1000 : Math.min(hwFreq, maxFreq);
	return { displayFreq: displayFreq, displayMax: displayMax, isOverclocked: isOverclocked };
}

function renderFreqBar(hwFreq, minFreq, maxFreq, pllFreqMhz, governor) {
	if (!maxFreq || maxFreq === 0) return E('span', {}, 'N/A');

	var s = freqBarState(hwFreq, minFreq, maxFreq, pllFreqMhz, governor);
	var pct = Math.round(((s.displayFreq - minFreq) / (s.displayMax - minFreq)) * 100);
	if (pct < 0) pct = 0;
	if (pct > 100) pct = 100;

	var bColor = s.isOverclocked
		? 'linear-gradient(90deg,#e65100,#ff9800)'
		: 'linear-gradient(90deg,#2e7d32,#66bb6a)';
	var freqLabel = s.isOverclocked ? (pllFreqMhz + ' MHz (OC)') : formatFreqMHz(s.displayFreq);

	return E('div', { 'id': 'cpu-freq-bar-wrap', 'style': 'display:flex;align-items:center;gap:10px' }, [
		E('span', { 'style': 'color:#aaa;font-size:90%' }, formatFreqMHz(minFreq)),
		E('div', { 'style': 'flex:1;background:#333;border-radius:4px;height:22px;position:relative;min-width:180px;max-width:350px' }, [
			E('div', { 'id': 'cpu-freq-fill', 'style': 'background:' + bColor + ';height:100%;border-radius:4px;width:' + pct + '%;transition:width 0.5s ease' }),
			E('span', { 'id': 'cpu-freq-text', 'style': 'position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:13px;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.6)' },
				freqLabel),
		]),
		E('span', { 'id': 'cpu-freq-max-label', 'style': 'color:#aaa;font-size:90%' }, formatFreqMHz(s.displayMax))
	]);
}

function updateFreqBar(hwFreq, minFreq, maxFreq, pllFreqMhz, governor) {
	var textEl = document.getElementById('cpu-freq-text');
	var fillEl = document.getElementById('cpu-freq-fill');
	var maxLabel = document.getElementById('cpu-freq-max-label');

	var s = freqBarState(hwFreq, minFreq, maxFreq, pllFreqMhz, governor);

	if (textEl) {
		textEl.textContent = s.isOverclocked ? (pllFreqMhz + ' MHz (OC)') : formatFreqMHz(s.displayFreq);
	}
	if (fillEl && s.displayMax > 0) {
		var pct = Math.round(((s.displayFreq - minFreq) / (s.displayMax - minFreq)) * 100);
		if (pct < 0) pct = 0;
		if (pct > 100) pct = 100;
		fillEl.style.width = pct + '%';
		fillEl.style.background = s.isOverclocked
			? 'linear-gradient(90deg,#e65100,#ff9800)'
			: 'linear-gradient(90deg,#2e7d32,#66bb6a)';
	}
	if (maxLabel) {
		maxLabel.textContent = formatFreqMHz(s.displayMax);
	}
}

function renderGovernorSelect(availGovs, activeGov) {
	var govs = (availGovs || '').trim().split(/\s+/).filter(function(g) { return g.length > 0; });
	if (govs.length === 0) return E('span', {}, 'N/A');

	var select = E('select', {
		'id': 'cpu-governor-select',
		'class': 'cbi-input-select',
		'style': 'min-width:140px',
		'change': function(ev) {
			var gov = ev.target.value;
			ev.target.disabled = true;
			callSetGovernor(gov).then(function(res) {
				ev.target.disabled = false;
				if (res && res.error) {
					ui.addNotification(null, E('p', {}, _('Failed to set governor: ') + res.error), 'error');
				}
			}).catch(function() {
				ev.target.disabled = false;
			});
		}
	}, govs.map(function(gov) {
		return E('option', { 'value': gov, 'selected': gov === activeGov ? '' : null }, gov);
	}));

	return select;
}

function renderMaxFreqSelect(availFreqs, currentMax) {
	var freqs = (availFreqs || '').trim().split(/\s+/).filter(function(f) { return f.length > 0; });
	if (freqs.length === 0) return E('span', {}, 'N/A');

	var select = E('select', {
		'id': 'cpu-maxfreq-select',
		'class': 'cbi-input-select',
		'style': 'min-width:140px',
		'change': function(ev) {
			var freq = ev.target.value;
			ev.target.disabled = true;
			callSetMaxFreq(parseInt(freq)).then(function(res) {
				ev.target.disabled = false;
				if (res && res.error) {
					ui.addNotification(null, E('p', {}, _('Failed to set max frequency: ') + res.error), 'error');
				}
			}).catch(function() {
				ev.target.disabled = false;
			});
		}
	}, freqs.map(function(freq) {
		var mhz = (parseInt(freq) / 1000).toFixed(0) + ' MHz';
		return E('option', {
			'value': freq,
			'selected': parseInt(freq) === parseInt(currentMax) ? '' : null
		}, mhz);
	}));

	return select;
}

function renderOverclockControls() {
	var input = E('input', {
		'id': 'oc-freq-input',
		'type': 'number',
		'min': '500',
		'max': '1600',
		'step': '50',
		'value': '1400',
		'class': 'cbi-input-text',
		'style': 'width:100px'
	});

	var btn = E('button', {
		'class': 'cbi-button cbi-button-action',
		'style': 'margin-left:8px',
		'click': function() {
			var freq = parseInt(document.getElementById('oc-freq-input').value);
			if (isNaN(freq) || freq < 500 || freq > 1600) {
				ui.addNotification(null, E('p', {}, _('Frequency must be 500-1600 MHz')), 'error');
				return;
			}
			if (freq > 1400) {
				if (!confirm('WARNING: Frequencies above 1400 MHz may be unstable at stock voltage. Continue?')) {
					return;
				}
			}
			btn.disabled = true;
			btn.textContent = _('Applying...');
			callSetOverclock(freq).then(function(res) {
				btn.disabled = false;
				btn.textContent = _('Apply');
				if (res && res.error) {
					ui.addNotification(null, E('p', {}, _('Overclock failed: ') + res.error), 'error');
				} else if (res && res.result === 'ok') {
					ui.addNotification(null, E('p', {},
						_('CPU set to ') + res.actual_mhz + ' MHz (PCW=' + res.pcw + ', posdiv=' + res.posdiv + ')'), 'info');
				}
			}).catch(function(err) {
				btn.disabled = false;
				btn.textContent = _('Apply');
				ui.addNotification(null, E('p', {}, _('Overclock failed: ') + err.message), 'error');
			});
		}
	}, _('Apply'));

	return E('div', { 'style': 'display:flex;align-items:center;gap:8px;flex-wrap:wrap' }, [
		input,
		E('span', { 'style': 'color:#aaa' }, 'MHz'),
		btn,
		E('span', { 'style': 'color:#888;font-size:85%;margin-left:8px' },
			_('Direct PLL programming. Governor locked to performance. Stock max: 1200 MHz. Tested stable up to 1500 MHz.'))
	]);
}

function renderPpeRows(entries) {
	return entries.slice(0, 100).map(function(entry) {
		var stateClass = entry.state === 'BND' ? 'label-success' : '';
		var ethDisplay = entry.eth || '';
		if (ethDisplay === '00:00:00:00:00:00->00:00:00:00:00:00') {
			ethDisplay = '-';
		}
		return E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td' }, entry.index),
			E('td', { 'class': 'td' }, E('span', { 'class': stateClass }, entry.state)),
			E('td', { 'class': 'td' }, entry.type),
			E('td', { 'class': 'td' }, entry.orig || '-'),
			E('td', { 'class': 'td' }, entry.new_flow || '-'),
			E('td', { 'class': 'td' }, ethDisplay)
		]);
	});
}

return view.extend({
	load: function() {
		return Promise.all([
			callNpuStatus(),
			callPpeEntries(),
			callTokenInfo()
		]);
	},

	render: function(data) {
		var status = data[0] || {};
		var ppeData = data[1] || {};
		var tokenInfo = data[2] || {};
		var entries = Array.isArray(ppeData.entries) ? ppeData.entries : [];
		var memRegions = Array.isArray(status.memory_regions) ? status.memory_regions : [];
		var totalMemoryStr = calcTotalMemory(memRegions);
		var tpHealth = tokenHealth(tokenInfo.token_count || 0, tokenInfo.token_size || 1);

		// Build band cards
		var bandCards = [];
		for (var b = 0; b < 3; b++) {
			bandCards.push(renderBandCard(b, getTxQueue(tokenInfo, b), getBandStats(tokenInfo, b)));
		}

		var viewEl = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Airoha SoC Status')),

			// CPU Frequency Section
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('CPU Frequency')),
				E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td', 'width': '33%' }, E('strong', {}, _('Current Frequency'))),
						E('td', { 'class': 'td' },
							renderFreqBar(status.cpu_hw_freq, status.cpu_min_freq, status.cpu_max_freq, status.pll_freq_mhz, status.cpu_governor))
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td' }, E('strong', {}, _('Governor'))),
						E('td', { 'class': 'td' },
							renderGovernorSelect(status.cpu_avail_governors, status.cpu_governor))
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td' }, E('strong', {}, _('Max Frequency'))),
						E('td', { 'class': 'td' },
							renderMaxFreqSelect(status.cpu_avail_freqs, status.cpu_max_freq))
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td' }, E('strong', {}, _('Overclock'))),
						E('td', { 'class': 'td' }, renderOverclockControls())
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td' }, E('strong', {}, _('CPU Cores'))),
						E('td', { 'class': 'td' }, (status.cpu_count || 0).toString())
					])
				])
			]),

			// NPU & Wireless Offload Section
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('NPU & Wireless Offload')),
				E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td', 'width': '33%' }, E('strong', {}, _('NPU Status'))),
						E('td', { 'class': 'td', 'id': 'npu-status' }, status.npu_loaded ?
							E('span', { 'class': 'label-success' }, _('Active') + (status.npu_device ? ' (' + status.npu_device + ')' : '')) :
							E('span', { 'class': 'label-danger' }, _('Not Active')))
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td' }, E('strong', {}, _('Firmware / Clock / Cores'))),
						E('td', { 'class': 'td', 'id': 'npu-info' },
							(status.npu_version || 'N/A') + '  |  ' +
							(status.npu_clock ? (status.npu_clock / 1000000).toFixed(0) + ' MHz' : 'N/A') + '  |  ' +
							(status.npu_cores || 0) + ' cores')
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td' }, E('strong', {}, _('Reserved Memory'))),
						E('td', { 'class': 'td', 'id': 'npu-memory' }, totalMemoryStr + ' (' + memRegions.length + ' regions)')
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td' }, E('strong', {}, _('Token Pool'))),
						E('td', { 'class': 'td' },
							E('div', { 'style': 'display:flex;align-items:center;gap:8px' }, [
								E('span', { 'id': 'token-dot', 'style': 'width:8px;height:8px;border-radius:50%;background:' + tpHealth.color + ';display:inline-block' }),
								E('span', { 'id': 'token-label', 'style': 'color:' + tpHealth.color + ';font-weight:500' }, tpHealth.text),
								E('span', { 'id': 'token-count', 'style': 'color:#888;margin-left:4px' },
									(tokenInfo.token_count || 0) + ' / ' + (tokenInfo.token_size || 0) + ' in-flight')
							]))
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td' }, E('strong', {}, _('PPE Flows'))),
						E('td', { 'class': 'td', 'id': 'npu-offload' },
							(status.offload_bound || 0) + ' bound / ' + (status.offload_total || 0) + ' total')
					])
				]),

				// Band cards grid
				E('div', { 'style': 'display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-top:8px;padding:0 4px' }, bandCards)
			]),

			// PPE Flow Offload Section
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('PPE Flow Offload Entries')),
				E('table', { 'class': 'table', 'id': 'ppe-entries-table' }, [
					E('tr', { 'class': 'tr cbi-section-table-titles' }, [
						E('th', { 'class': 'th' }, _('Index')),
						E('th', { 'class': 'th' }, _('State')),
						E('th', { 'class': 'th' }, _('Type')),
						E('th', { 'class': 'th' }, _('Original Flow')),
						E('th', { 'class': 'th' }, _('New Flow')),
						E('th', { 'class': 'th' }, _('Ethernet'))
					])
				].concat(renderPpeRows(entries)))
			])
		]);

		poll.add(L.bind(function() {
			return Promise.all([
				callNpuStatus(),
				callPpeEntries(),
				callTokenInfo()
			]).then(L.bind(function(data) {
				var status = data[0] || {};
				var ppeData = data[1] || {};
				var tokenInfo = data[2] || {};
				var entries = Array.isArray(ppeData.entries) ? ppeData.entries : [];

				// Update CPU frequency bar
				updateFreqBar(status.cpu_hw_freq, status.cpu_min_freq, status.cpu_max_freq, status.pll_freq_mhz, status.cpu_governor);

				// Update governor select
				var govSelect = document.getElementById('cpu-governor-select');
				if (govSelect && !govSelect.matches(':focus')) {
					govSelect.value = status.cpu_governor || '';
				}

				// Update max freq select
				var freqSelect = document.getElementById('cpu-maxfreq-select');
				if (freqSelect && !freqSelect.matches(':focus')) {
					freqSelect.value = (status.cpu_max_freq || 0).toString();
				}

				// Update NPU status badge
				var statusEl = document.getElementById('npu-status');
				if (statusEl) {
					statusEl.innerHTML = '';
					var span = document.createElement('span');
					span.className = status.npu_loaded ? 'label-success' : 'label-danger';
					span.textContent = status.npu_loaded
						? (_('Active') + (status.npu_device ? ' (' + status.npu_device + ')' : ''))
						: _('Not Active');
					statusEl.appendChild(span);
				}

				// Update token pool health
				var tpHealth = tokenHealth(tokenInfo.token_count || 0, tokenInfo.token_size || 1);
				var tokenDot = document.getElementById('token-dot');
				var tokenLabel = document.getElementById('token-label');
				var tokenCount = document.getElementById('token-count');
				if (tokenDot) tokenDot.style.background = tpHealth.color;
				if (tokenLabel) {
					tokenLabel.textContent = tpHealth.text;
					tokenLabel.style.color = tpHealth.color;
				}
				if (tokenCount) tokenCount.textContent = (tokenInfo.token_count || 0) + ' / ' + (tokenInfo.token_size || 0) + ' in-flight';

				// Update PPE flows
				var offloadEl = document.getElementById('npu-offload');
				if (offloadEl) {
					offloadEl.textContent = (status.offload_bound || 0) + ' bound / ' + (status.offload_total || 0) + ' total';
				}

				// Update band cards
				for (var b = 0; b < 3; b++) {
					updateBandCard(b, getBandStats(tokenInfo, b));
				}

				// Update PPE table
				var table = document.getElementById('ppe-entries-table');
				if (table) {
					while (table.rows.length > 1) {
						table.deleteRow(1);
					}
					var newRows = renderPpeRows(entries);
					newRows.forEach(function(row) {
						table.appendChild(row);
					});
				}
			}, this));
		}, this), 5);

		return viewEl;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
