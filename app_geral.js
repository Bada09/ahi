// Global State
let allData = [];
let filteredData = [];
let activePdvsInMonth = [];
let activeRange = 'all'; // 'all', '7days', '15days', 'month'
let selectedStartDate = null;
let selectedEndDate = null;

// Reservoir Constant Configurations (20L per local)
const INITIAL_RESERVOIR_ML = 20000; 
const DET_CONSUMPTION_PER_CYCLE = 50; 
const AMA_CONSUMPTION_PER_CYCLE = 50; 

// Chart instances
let cyclesChartInstance = null;
let peakTimesChartInstance = null;
let paymentChartInstance = null;

// Pagination state
let currentPage = 1;
const rowsPerPage = 10;
let sortedColumn = 'data';
let sortDirection = 'desc';

// Operational Data Lookup maps
let normalizedRent = {};
let normalizedAddresses = {};
let normalizedZonas = {};
let normalizedCosts = {};
let normalizedCoordinates = {};
let pdvMap = null;
let pdvMapMarkers = null;

function normalizeKey(str) {
    if (!str) return "";
    return str.toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9]/g, "");
}

// Helper to get active PDVs that had transactions in the month(s) of the selected date range
function getActivePdvsInMonth(startDate, endDate) {
    const startMonthLimit = new Date(startDate.getFullYear(), startDate.getMonth(), 1, 0, 0, 0);
    const endMonthLimit = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0, 23, 59, 59, 999);
    
    const pdvs = new Set();
    allData.forEach(d => {
        if (d.dateObj) {
            const time = d.dateObj.getTime();
            if (time >= startMonthLimit.getTime() && time <= endMonthLimit.getTime()) {
                pdvs.add(d.pdv);
            }
        }
    });
    return Array.from(pdvs);
}

function initOperationalData() {
    if (typeof operationalRent !== 'undefined') {
        Object.keys(operationalRent).forEach(k => {
            normalizedRent[normalizeKey(k)] = operationalRent[k];
        });
    }
    if (typeof operationalAddresses !== 'undefined') {
        Object.keys(operationalAddresses).forEach(k => {
            normalizedAddresses[normalizeKey(k)] = operationalAddresses[k];
        });
    }
    if (typeof operationalZonas !== 'undefined') {
        Object.keys(operationalZonas).forEach(k => {
            normalizedZonas[normalizeKey(k)] = operationalZonas[k];
        });
    }
    if (typeof operationalCosts !== 'undefined') {
        Object.keys(operationalCosts).forEach(k => {
            normalizedCosts[normalizeKey(k)] = operationalCosts[k];
        });
    }
    if (typeof operationalCoordinates !== 'undefined') {
        Object.keys(operationalCoordinates).forEach(k => {
            normalizedCoordinates[normalizeKey(k)] = operationalCoordinates[k];
        });
    }
}

function getRentForPdv(pdv) {
    const key = normalizeKey(pdv);
    return normalizedRent[key] || 0;
}
function getAddressForPdv(pdv) {
    const key = normalizeKey(pdv);
    return normalizedAddresses[key] || "Endereço não cadastrado";
}
function getZonaForPdv(pdv) {
    const key = normalizeKey(pdv);
    return normalizedZonas[key] || { zona: "N/A", maquinas: 0 };
}
function getCostsForPdv(pdv) {
    const key = normalizeKey(pdv);
    return normalizedCosts[key] || { total: 0, tecnico: 0, engenheiro: 0, internet: 0, pagamento: 0 };
}

function getCoordinatesForPdv(pdv) {
    const key = normalizeKey(pdv);
    return normalizedCoordinates[key] || null;
}

// Helper to convert DD/MM/YYYY date to Date Object
function parseDateString(dateStr, timeStr) {
    if (!dateStr) return new Date(0);
    const parts = dateStr.split('/');
    if (parts.length < 3) return new Date(0);
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    
    if (timeStr) {
        const timeParts = timeStr.split(':');
        const hours = parseInt(timeParts[0], 10) || 0;
        const minutes = parseInt(timeParts[1], 10) || 0;
        const seconds = timeParts.length > 2 ? (parseInt(timeParts[2], 10) || 0) : 0;
        return new Date(year, month, day, hours, minutes, seconds);
    }
    return new Date(year, month, day);
}



// Load and Initialize Data
document.addEventListener('DOMContentLoaded', () => {
    const loader = document.getElementById('loader');
    
    try {
        if (typeof rawLaundryDataGerais === 'undefined') {
            throw new Error("Dados não definidos. Certifique-se de que o data_gerais.js foi importado.");
        }
        
        allData = rawLaundryDataGerais.map(item => {
            const arr = Array.isArray(item) ? item : item.value;
            const dateTime = parseDateString(arr[5], arr[6]);
            // Dados mistos: Vmpay armazena em centavos (1499 = R$14,99),
            // Vendpago e outros armazenam em reais (16 = R$16,00, 14 = R$14,00).
            // Heurística: valores >= 100 são centavos; < 100 já são reais.
            const rawVal = (typeof arr[4] === 'number') ? arr[4] : parseFloat(arr[4]) || 0;
            const totalReais = rawVal >= 100 ? rawVal / 100 : rawVal;
            return {
                pdv: arr[0],
                pagamento: arr[1],
                mola: arr[2],
                tipoMaquina: arr[3],
                total: totalReais,
                venda: totalReais,
                data: arr[5],
                hora: arr[6],
                bandeira: arr[7],
                autorizacao: arr[8],
                dateObj: dateTime,
                dayStr: arr[5]
            };
        });
        
        // Initialize operational data maps
        initOperationalData();
        
        // Populate Dynamic Month and Year Selectors
        const monthNames = [
            "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
            "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
        ];
        
        const yearSelect = document.getElementById('filter-year');
        const monthSelect = document.getElementById('filter-month');
        const startInput = document.getElementById('date-start');
        const endInput = document.getElementById('date-end');
        
        const yearsSet = new Set();
        allData.forEach(d => {
            if (d.dateObj) {
                yearsSet.add(d.dateObj.getFullYear());
            }
        });
        const sortedYears = Array.from(yearsSet).sort((a,b) => b - a);
        
        if (yearSelect) {
            yearSelect.innerHTML = '<option value="all">Todos os Anos</option>';
            sortedYears.forEach(y => {
                const opt = document.createElement('option');
                opt.value = y;
                opt.innerText = y;
                yearSelect.appendChild(opt);
            });
            // Default select latest year
            if (sortedYears.includes(2026)) {
                yearSelect.value = "2026";
            } else if (sortedYears.length > 0) {
                yearSelect.value = sortedYears[0].toString();
            }
        }
        
        window.populateMonths = function() {
            if (!monthSelect) return;
            const selectedYear = yearSelect ? yearSelect.value : 'all';
            
            const monthsInYear = new Set();
            allData.forEach(d => {
                if (d.dateObj) {
                    const y = d.dateObj.getFullYear();
                    if (selectedYear === 'all' || y === parseInt(selectedYear)) {
                        monthsInYear.add(d.dateObj.getMonth());
                    }
                }
            });
            
            const sortedMonths = Array.from(monthsInYear).sort((a,b) => a - b);
            
            monthSelect.innerHTML = '<option value="all">Todos os Meses</option>';
            sortedMonths.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.innerText = monthNames[m];
                monthSelect.appendChild(opt);
            });
            
            if (selectedYear === "2026" && sortedMonths.includes(5)) {
                monthSelect.value = "5"; // June (0-indexed)
            } else if (sortedMonths.length > 0) {
                monthSelect.value = sortedMonths[sortedMonths.length - 1].toString();
            }
        };
        
        window.populateMonths();
        
        // Determine date range on load
        if (yearSelect && yearSelect.value !== 'all' && monthSelect && monthSelect.value !== 'all') {
            const y = parseInt(yearSelect.value, 10);
            const m = parseInt(monthSelect.value, 10);
            selectedStartDate = new Date(y, m, 1, 0, 0, 0);
            
            const monthDates = allData
                .filter(d => d.dateObj && d.dateObj.getFullYear() === y && d.dateObj.getMonth() === m)
                .map(d => d.dateObj.getTime());
            if (monthDates.length > 0) {
                selectedEndDate = new Date(monthDates.reduce((a, b) => a > b ? a : b));
                selectedEndDate.setHours(23,59,59,999);
            } else {
                selectedEndDate = new Date(y, m + 1, 0, 23, 59, 59);
            }
        } else if (allData.length > 0) {
            const dates = allData.map(d => d.dateObj.getTime());
            selectedStartDate = new Date(dates.reduce((a, b) => a < b ? a : b));
            selectedStartDate.setHours(0,0,0,0);
            selectedEndDate = new Date(dates.reduce((a, b) => a > b ? a : b));
            selectedEndDate.setHours(23,59,59,999);
        } else {
            selectedStartDate = new Date(2026, 5, 1);
            selectedEndDate = new Date(2026, 5, 15);
        }
        
        if (startInput) startInput.value = formatDateToISO(selectedStartDate);
        if (endInput) endInput.value = formatDateToISO(selectedEndDate);
        
        // Populate PDV selector dynamically
        const pdvSelect = document.getElementById('filter-pdv');
        if (pdvSelect) {
            const uniquePdvs = [...new Set(allData.map(item => item.pdv))].sort();
            uniquePdvs.forEach(pdv => {
                const opt = document.createElement('option');
                opt.value = pdv;
                opt.innerText = pdv;
                pdvSelect.appendChild(opt);
            });
            
            pdvSelect.addEventListener('change', () => {
                applyFilters();
            });
        }
        
        // Setup Tab Toggling
        setupTabToggling();
        
        // Setup Listeners
        setupFilterListeners();
        setupTableListeners();
        
        // Setup Cost Export Button
        const btnExportCosts = document.getElementById('btn-export-excel-costs');
        if (btnExportCosts) {
            btnExportCosts.addEventListener('click', () => {
                exportCostsToExcel();
            });
        }
        
        // Filter and update UI
        applyFilters();
        
        // Initialize map after DOM is fully ready and data is loaded
        setTimeout(() => {
            initializePdvMap();
        }, 100);
        
        // Remove loader with smooth transition
        setTimeout(() => {
            if (loader) {
                loader.style.opacity = 0;
                setTimeout(() => loader.style.display = 'none', 400);
            }
        }, 300);
    } catch (err) {
        console.error(err);
        const loaderText = document.querySelector('.loader-text');
        if (loaderText) {
            loaderText.innerHTML = `<span style="color: #ef4444;">Erro ao iniciar painel geral: ${err.message}</span>`;
        }
    }
});

// Setup Tab Toggling between "Visão Geral" and "Custos e Margens"
function setupTabToggling() {
    const tabOverview = document.getElementById('tab-overview');
    const tabCosts = document.getElementById('tab-costs');
    const contentOverview = document.getElementById('content-overview');
    const contentCosts = document.getElementById('content-costs');
    
    if (!tabOverview || !tabCosts) return;
    
    tabOverview.addEventListener('click', () => {
        tabOverview.classList.add('active');
        tabCosts.classList.remove('active');
        if (contentOverview) contentOverview.classList.add('active');
        if (contentCosts) contentCosts.classList.remove('active');
    });
    
    tabCosts.addEventListener('click', () => {
        tabCosts.classList.add('active');
        tabOverview.classList.remove('active');
        if (contentCosts) contentCosts.classList.add('active');
        if (contentOverview) contentOverview.classList.remove('active');
        // Re-render costs table when tab is activated
        updateCostsTabUI();
    });
}


function formatDateToISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Setup Event Listeners for Filter Section
function setupFilterListeners() {
    const startInput = document.getElementById('date-start');
    const endInput = document.getElementById('date-end');
    
    startInput.addEventListener('change', (e) => {
        if (e.target.value) {
            selectedStartDate = new Date(e.target.value + 'T00:00:00');
            setActiveRangeButton(null);
            applyFilters();
        }
    });
    
    endInput.addEventListener('change', (e) => {
        if (e.target.value) {
            selectedEndDate = new Date(e.target.value + 'T23:59:59');
            setActiveRangeButton(null);
            applyFilters();
        }
    });
    
    // Quick Range buttons
    document.getElementById('btn-range-all').addEventListener('click', (e) => {
        setActiveRangeButton('all');
        if (allData.length > 0) {
            const dates = allData.map(d => d.dateObj.getTime());
            selectedStartDate = new Date(dates.reduce((a, b) => a < b ? a : b));
            selectedStartDate.setHours(0,0,0,0);
            selectedEndDate = new Date(dates.reduce((a, b) => a > b ? a : b));
            selectedEndDate.setHours(23,59,59,999);
            
            startInput.value = formatDateToISO(selectedStartDate);
            endInput.value = formatDateToISO(selectedEndDate);
            applyFilters();
        }
    });
    
    document.getElementById('btn-range-7').addEventListener('click', () => {
        setActiveRangeButton('7');
        if (allData.length > 0) {
            const maxDate = new Date(allData.reduce((max, d) => d.dateObj.getTime() > max ? d.dateObj.getTime() : max, 0));
            selectedEndDate = new Date(maxDate);
            selectedEndDate.setHours(23,59,59,999);
            
            selectedStartDate = new Date(maxDate);
            selectedStartDate.setDate(selectedStartDate.getDate() - 6);
            selectedStartDate.setHours(0,0,0,0);
            
            startInput.value = formatDateToISO(selectedStartDate);
            endInput.value = formatDateToISO(selectedEndDate);
            applyFilters();
        }
    });
    
    document.getElementById('btn-range-15').addEventListener('click', () => {
        setActiveRangeButton('15');
        if (allData.length > 0) {
            const maxDate = new Date(allData.reduce((max, d) => d.dateObj.getTime() > max ? d.dateObj.getTime() : max, 0));
            selectedEndDate = new Date(maxDate);
            selectedEndDate.setHours(23,59,59,999);
            
            selectedStartDate = new Date(maxDate);
            selectedStartDate.setDate(selectedStartDate.getDate() - 14);
            selectedStartDate.setHours(0,0,0,0);
            
            startInput.value = formatDateToISO(selectedStartDate);
            endInput.value = formatDateToISO(selectedEndDate);
            applyFilters();
        }
    });
    
    const yearSelect = document.getElementById('filter-year');
    const monthSelect = document.getElementById('filter-month');
    
    if (yearSelect) {
        yearSelect.addEventListener('change', () => {
            window.populateMonths();
            updateDatesFromPeriodFilters();
        });
    }
    
    if (monthSelect) {
        monthSelect.addEventListener('change', () => {
            updateDatesFromPeriodFilters();
        });
    }
}

function updateDatesFromPeriodFilters() {
    const yearVal = document.getElementById('filter-year').value;
    const monthVal = document.getElementById('filter-month').value;
    
    const startInput = document.getElementById('date-start');
    const endInput = document.getElementById('date-end');
    
    if (yearVal === 'all') {
        if (allData.length > 0) {
            const dates = allData.map(d => d.dateObj.getTime());
            selectedStartDate = new Date(dates.reduce((a, b) => a < b ? a : b));
            selectedStartDate.setHours(0,0,0,0);
            selectedEndDate = new Date(dates.reduce((a, b) => a > b ? a : b));
            selectedEndDate.setHours(23,59,59,999);
        }
    } else {
        const y = parseInt(yearVal, 10);
        if (monthVal === 'all') {
            selectedStartDate = new Date(y, 0, 1, 0, 0, 0);
            selectedEndDate = new Date(y, 11, 31, 23, 59, 59);
        } else {
            const m = parseInt(monthVal, 10);
            selectedStartDate = new Date(y, m, 1, 0, 0, 0);
            
            const monthDates = allData
                .filter(d => d.dateObj && d.dateObj.getFullYear() === y && d.dateObj.getMonth() === m)
                .map(d => d.dateObj.getTime());
            
            if (monthDates.length > 0) {
                selectedEndDate = new Date(monthDates.reduce((a, b) => a > b ? a : b));
                selectedEndDate.setHours(23,59,59,999);
            } else {
                selectedEndDate = new Date(y, m + 1, 0, 23, 59, 59);
            }
        }
    }
    
    if (startInput) startInput.value = formatDateToISO(selectedStartDate);
    if (endInput) endInput.value = formatDateToISO(selectedEndDate);
    
    applyFilters();
}

function setActiveRangeButton(range) {
    activeRange = range;
    document.querySelectorAll('.btn-range').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (range === 'all') {
        document.getElementById('btn-range-all').classList.add('active');
    } else if (range === '7') {
        document.getElementById('btn-range-7').classList.add('active');
    } else if (range === '15') {
        document.getElementById('btn-range-15').classList.add('active');
    }
}

// Apply Filters to Data and Trigger Updates
function applyFilters() {
    const selectedPdv = document.getElementById('filter-pdv').value;
    
    filteredData = allData.filter(item => {
        const time = item.dateObj.getTime();
        const matchesDate = time >= selectedStartDate.getTime() && time <= selectedEndDate.getTime();
        const matchesPdv = selectedPdv === 'all' || item.pdv === selectedPdv;
        return matchesDate && matchesPdv;
    });
    
    // Update activePdvsInMonth globally based on the selected month(s)
    activePdvsInMonth = getActivePdvsInMonth(selectedStartDate, selectedEndDate);
    
    currentPage = 1;
    updateKPIs();
    updateReservoirsUI();
    renderCharts();
    updateTable();
    updateCostsTabUI();
    if (pdvMap) updatePdvMapMarkers();
}

// Calculate and Update KPI Card Values
function updateKPIs() {
    const selectedPdv = document.getElementById('filter-pdv').value;
    
    // Determine days in selected range
    const timeDiff = selectedEndDate.getTime() - selectedStartDate.getTime();
    const daysSelected = Math.max(1, Math.floor(timeDiff / (1000 * 60 * 60 * 24)));

    // Total Revenue (faturado)
    const totalRevenue = filteredData.reduce((acc, curr) => acc + curr.total, 0);
    document.getElementById('kpi-revenue-val').innerText = formatCurrency(totalRevenue);
    
    // Determine active PDVs in the filtered data
    const activePdvs = [...new Set(filteredData.map(d => d.pdv))];
    
    // Fixed Operational Costs (Rent + Technical visit cost), based on active PDVs in the month
    let totalMonthlyCost = 0;
    if (selectedPdv === 'all') {
        activePdvsInMonth.forEach(p => {
            totalMonthlyCost += getRentForPdv(p) + getCostsForPdv(p).total;
        });
    } else {
        totalMonthlyCost = getRentForPdv(selectedPdv) + getCostsForPdv(selectedPdv).total;
    }
    
    // Prorate monthly costs for the selected period
    const periodCost = totalMonthlyCost * (daysSelected / 30);
    const netProfit = totalRevenue - periodCost;
    
    // Update Operational Costs and Profit KPIs in DOM
    const costsValEl = document.getElementById('kpi-costs-val');
    if (costsValEl) costsValEl.innerText = formatCurrency(periodCost);
    const costsSubEl = document.getElementById('kpi-costs-sub');
    if (costsSubEl) {
        costsSubEl.innerHTML = `<span>Aluguel + Despesas (${daysSelected}d de ref. R$ ${totalMonthlyCost.toFixed(0).replace('.', ',')}/mês)</span>`;
    }
    
    const profitValEl = document.getElementById('kpi-profit-val');
    if (profitValEl) profitValEl.innerText = formatCurrency(netProfit);
    const profitSubEl = document.getElementById('kpi-profit-sub');
    if (profitSubEl) {
        if (netProfit >= 0) {
            profitSubEl.innerHTML = `<i class="fas fa-arrow-up" style="color: #fff !important; margin-right: 4px;"></i> <span>Lucro real do período</span>`;
        } else {
            profitSubEl.innerHTML = `<i class="fas fa-arrow-down" style="color: #fff !important; margin-right: 4px;"></i> <span>Prejuízo líquido no período</span>`;
        }
    }

    // Wash vs Dry Breakdowns
    const washCycles = filteredData.filter(d => d.tipoMaquina === 'Lavadora').length;
    const dryCycles = filteredData.filter(d => d.tipoMaquina === 'Secadora').length;
    
    document.getElementById('kpi-wash-val').innerText = washCycles;
    document.getElementById('kpi-dry-val').innerText = dryCycles;
    
    // Configured machine counts for daily averages and subtitles, based on active PDVs in the month
    const totalMachines = Math.max(1, selectedPdv === 'all'
        ? activePdvsInMonth.reduce((acc, p) => acc + getZonaForPdv(p).maquinas, 0)
        : getZonaForPdv(selectedPdv).maquinas);
    const numWashers = Math.max(1, totalMachines / 2);
    const numDryers = Math.max(1, totalMachines / 2);
    const numMolas = totalMachines;

    // Daily Averages
    const averageWashDaily = washCycles / (numWashers * daysSelected);
    const averageDryDaily = dryCycles / (numDryers * daysSelected);
    const averageCyclesDaily = filteredData.length / (numMolas * daysSelected);
    
    const avgCyclesBadge = document.getElementById('average-cycles-badge');
    if (avgCyclesBadge) {
        avgCyclesBadge.innerText = `Média: ${averageCyclesDaily.toFixed(2).replace('.', ',')} ciclos/dia`;
    }

    const sideAverage = document.getElementById('side-card-average');
    if (sideAverage) {
        sideAverage.innerText = averageCyclesDaily.toFixed(2).replace('.', ',');
    }

    const sidePdvs = document.getElementById('side-card-pdvs');
    if (sidePdvs) {
        sidePdvs.innerText = selectedPdv === 'all' ? activePdvsInMonth.length : 1;
    }

    let availableCount = 0;
    let maintenanceCount = 0;
    if (typeof operationalMachineStatus !== 'undefined') {
        const selectedStatusData = operationalMachineStatus.filter(m => selectedPdv === 'all' || m.pdv === selectedPdv);
        const statusKeyMap = new Map();
        selectedStatusData.forEach(m => {
            const key = `${m.pdv}||${m.torre}||${m.maquina}`;
            const current = statusKeyMap.get(key);
            if (!current || `${m.data} ${m.hora}` > `${current.data} ${current.hora}`) {
                statusKeyMap.set(key, m);
            }
        });
        statusKeyMap.forEach(m => {
            const statusLower = m.status.toLowerCase();
            if (statusLower.includes('dispon') || statusLower.includes('available')) {
                availableCount += 1;
            }
            if (statusLower.includes('manuten') || statusLower.includes('manutenção') || statusLower.includes('maintenance')) {
                maintenanceCount += 1;
            }
        });
    }

    const sideAvailable = document.getElementById('side-card-available');
    if (sideAvailable) {
        sideAvailable.innerText = availableCount;
    }

    const sideMaintenance = document.getElementById('side-card-maintenance');
    if (sideMaintenance) {
        sideMaintenance.innerText = maintenanceCount;
    }

    const washSub = document.getElementById('kpi-wash-sub');
    if (washSub) {
        washSub.innerText = `Média: ${averageWashDaily.toFixed(1).replace('.', ',')}/dia • ${numWashers} Lavadora(s) ativa(s)`;
    }
    
    const drySub = document.getElementById('kpi-dry-sub');
    if (drySub) {
        drySub.innerText = `Média: ${averageDryDaily.toFixed(1).replace('.', ',')}/dia • ${numDryers} Secadora(s) ativa(s)`;
    }
    
    // Projeção de Faturamento (Revenue Projection)
    const daysInMonth = 30; // June 2026 has 30 days
    const dailyAverage = totalRevenue / daysSelected;
    const projectedRevenue = dailyAverage * daysInMonth;
    
    document.getElementById('kpi-projection-val').innerText = formatCurrency(projectedRevenue);
    document.getElementById('kpi-projection-sub').innerText = `Com base na média diária de R$ ${dailyAverage.toFixed(2).replace('.', ',')} (${daysSelected} dias selecionados)`;
    
    // Machine Occupancy / Taxa de ocupação
    const maxWashesInPeriod = 16 * numWashers * daysSelected;
    const maxDrysInPeriod = 14 * numDryers * daysSelected;
    
    const washOccupancyPct = maxWashesInPeriod > 0 ? (washCycles / maxWashesInPeriod) * 100 : 0;
    const dryOccupancyPct = maxDrysInPeriod > 0 ? (dryCycles / maxDrysInPeriod) * 100 : 0;
    
    document.getElementById('occupancy-wash-pct').innerText = `${washOccupancyPct.toFixed(1)}%`;
    document.getElementById('occupancy-wash-fill').style.setProperty('--perf-fill', `${washOccupancyPct}%`);
    document.getElementById('occupancy-wash-details').innerText = `${washCycles} lavagens realizadas (Máximo no período: ${maxWashesInPeriod})`;
    
    document.getElementById('occupancy-dry-pct').innerText = `${dryOccupancyPct.toFixed(1)}%`;
    document.getElementById('occupancy-dry-fill').style.setProperty('--perf-fill', `${dryOccupancyPct}%`);
    document.getElementById('occupancy-dry-details').innerText = `${dryCycles} secagens realizadas (Máximo no período: ${maxDrysInPeriod})`;

    // Calculate Peak & Idle Days and Hours
    let busiestDay = "--";
    let busiestDayCount = 0;
    let quietestDay = "--";
    let quietestDayCount = Infinity;
    
    let busiestHour = "--";
    let busiestHourCount = 0;
    let quietestHour = "--";
    let quietestHourCount = Infinity;

    // Day of week stats
    let bestDow = "--";
    let bestDowAvg = -1;
    let worstDow = "--";
    let worstDowAvg = Infinity;
    let hasDowData = false;
    
    if (filteredData.length > 0) {
        // 1. Group by day
        const dayCounts = {};
        filteredData.forEach(item => {
            dayCounts[item.dayStr] = (dayCounts[item.dayStr] || 0) + 1;
        });
        
        // Find max and min days
        Object.keys(dayCounts).forEach(day => {
            const count = dayCounts[day];
            if (count > busiestDayCount) {
                busiestDayCount = count;
                busiestDay = day;
            }
            if (count < quietestDayCount) {
                quietestDayCount = count;
                quietestDay = day;
            }
        });
        
        // 2. Group by hour (operating window: 07:00 to 23:00)
        const hourCounts = {};
        for (let h = 7; h <= 23; h++) {
            hourCounts[h] = 0;
        }
        
        filteredData.forEach(item => {
            const hour = parseInt(item.hora.split(':')[0], 10);
            if (hour >= 7 && hour <= 23) {
                hourCounts[hour] = (hourCounts[hour] || 0) + 1;
            }
        });
        
        // Find max and min hours
        Object.keys(hourCounts).forEach(h => {
            const count = hourCounts[h];
            const hourNum = parseInt(h, 10);
            
            if (count > busiestHourCount) {
                busiestHourCount = count;
                busiestHour = `${String(hourNum).padStart(2, '0')}:00h`;
            }
            
            if (count < quietestHourCount) {
                quietestHourCount = count;
                quietestHour = `${String(hourNum).padStart(2, '0')}:00h`;
            }
        });

        // 3. Day of Week Averaging
        const weekdayOccurrences = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        let tempDate = new Date(selectedStartDate.getTime());
        tempDate.setHours(12, 0, 0, 0); // avoid timezone issues during loop
        while (tempDate <= selectedEndDate) {
            const dayOfWeek = tempDate.getDay();
            weekdayOccurrences[dayOfWeek]++;
            tempDate.setDate(tempDate.getDate() + 1);
        }

        const washOnWeekday = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        const dryOnWeekday = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
        
        filteredData.forEach(item => {
            const dayOfWeek = item.dateObj.getDay();
            if (item.tipoMaquina === 'Lavadora') {
                washOnWeekday[dayOfWeek]++;
            } else if (item.tipoMaquina === 'Secadora') {
                dryOnWeekday[dayOfWeek]++;
            }
        });

        const weekdayNames = [
            "Domingo",
            "Segunda-feira",
            "Terça-feira",
            "Quarta-feira",
            "Quinta-feira",
            "Sexta-feira",
            "Sábado"
        ];
        
        for (let i = 0; i < 7; i++) {
            if (weekdayOccurrences[i] > 0) {
                hasDowData = true;
                
                // Number of configured machines for the selected filter
                const numMolasOnWeekday = totalMachines;
                
                // Average cycles per machine per day for this weekday
                const avgCycles = (washOnWeekday[i] + dryOnWeekday[i]) / (numMolasOnWeekday * weekdayOccurrences[i]);
                
                if (avgCycles > bestDowAvg) {
                    bestDowAvg = avgCycles;
                    bestDow = weekdayNames[i];
                }
                if (avgCycles < worstDowAvg) {
                    worstDowAvg = avgCycles;
                    worstDow = weekdayNames[i];
                }
            }
        }
    }
    
    // Update DOM for busiest/quietest
    const busiestDayVal = document.getElementById('kpi-busiest-day-val');
    if (busiestDayVal) busiestDayVal.innerText = busiestDay;
    const busiestDaySub = document.getElementById('kpi-busiest-day-sub');
    if (busiestDaySub) busiestDaySub.innerText = busiestDayCount > 0 ? `${busiestDayCount} ciclos` : "Nenhum ciclo";
    
    const quietestDayVal = document.getElementById('kpi-quietest-day-val');
    if (quietestDayVal) quietestDayVal.innerText = quietestDayCount === Infinity ? "--" : quietestDay;
    const quietestDaySub = document.getElementById('kpi-quietest-day-sub');
    if (quietestDaySub) quietestDaySub.innerText = quietestDayCount < Infinity ? `${quietestDayCount} ciclos` : "Nenhum ciclo";
    
    const busiestHourVal = document.getElementById('kpi-busiest-hour-val');
    if (busiestHourVal) busiestHourVal.innerText = busiestHour;
    const busiestHourSub = document.getElementById('kpi-busiest-hour-sub');
    if (busiestHourSub) busiestHourSub.innerText = busiestHourCount > 0 ? `${busiestHourCount} ciclos` : "Nenhum ciclo";
    
    const quietestHourVal = document.getElementById('kpi-quietest-hour-val');
    if (quietestHourVal) quietestHourVal.innerText = quietestHourCount === Infinity ? "--" : quietestHour;
    const quietestHourSub = document.getElementById('kpi-quietest-hour-sub');
    if (quietestHourSub) quietestHourSub.innerText = quietestHourCount < Infinity ? `${quietestHourCount} ciclos` : "Nenhum ciclo";

    // Update DOW DOM
    const bestDowVal = document.getElementById('kpi-best-dow-val');
    if (bestDowVal) bestDowVal.innerText = bestDow;
    const bestDowSub = document.getElementById('kpi-best-dow-sub');
    if (bestDowSub) {
        bestDowSub.innerText = hasDowData ? `Média: ${bestDowAvg.toFixed(2).replace('.', ',')} ciclos/dia` : "Sem dados";
    }

    const worstDowVal = document.getElementById('kpi-worst-dow-val');
    if (worstDowVal) worstDowVal.innerText = hasDowData ? worstDow : "--";
    const worstDowSub = document.getElementById('kpi-worst-dow-sub');
    if (worstDowSub) {
        worstDowSub.innerText = hasDowData ? `Média: ${worstDowAvg.toFixed(2).replace('.', ',')} ciclos/dia` : "Sem dados";
    }

    // Update PDV info and Real-Time status panel
    const infoPanel = document.getElementById('pdv-info-panel');
    if (infoPanel) {
        if (selectedPdv === 'all') {
            const totalRentAll = activePdvs.reduce((acc, p) => acc + getRentForPdv(p), 0);
            const totalRegs = [...new Set(activePdvs.map(p => getZonaForPdv(p).zona))].filter(z => z !== "N/A").join(", ");
            const totalMachinesAll = activePdvs.reduce((acc, p) => acc + getZonaForPdv(p).maquinas, 0);
            
            // Count machine statuses in all active locations
            const statuses = {};
            if (typeof operationalMachineStatus !== 'undefined') {
                operationalMachineStatus.forEach(m => {
                    const matchesPdv = activePdvs.some(p => normalizeKey(p) === normalizeKey(m.pdv));
                    if (matchesPdv) {
                        statuses[m.status] = (statuses[m.status] || 0) + 1;
                    }
                });
            }
            
            let statusHtml = "";
            Object.keys(statuses).forEach(st => {
                const color = st.toLowerCase() === 'disponivel' || st.toLowerCase() === 'disponível' ? '#10b981' : '#f59e0b';
                statusHtml += `<span style="font-size: 13px; font-weight: 600; color: var(--text-primary); margin-right: 16px; display: inline-flex; align-items: center; gap: 6px;">
                    <i class="fas fa-circle" style="color: ${color}; font-size: 10px;"></i> <strong>${st}:</strong> ${statuses[st]}
                </span>`;
            });
            if (!statusHtml) statusHtml = '<span style="color: var(--text-muted);">Sem dados de status de maquinários</span>';
            
            infoPanel.style.display = 'block';
            infoPanel.innerHTML = `
                <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 24px; align-items: center;">
                    <div>
                        <h3 style="font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;"><i class="fas fa-network-wired" style="color: var(--color-wash);"></i> Resumo Geral de PDVs</h3>
                        <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 4px;"><strong>PDVs com transações no período:</strong> ${activePdvs.length} local(is)</p>
                        <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;"><strong>Regiões operadas:</strong> ${totalRegs || "N/A"}</p>
                        <div style="display: flex; gap: 8px;">
                            <span class="btn-range" style="background: rgba(37, 99, 235, 0.1); color: var(--color-wash); font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px;">Custo Aluguel Mensal: ${formatCurrency(totalRentAll)}</span>
                            <span class="btn-range" style="background: rgba(16, 185, 129, 0.1); color: #10b981; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px;">Máquinas Cadastradas: ${totalMachinesAll}</span>
                        </div>
                    </div>
                    <div style="border-left: 1px solid var(--border-color); padding-left: 20px;">
                        <h3 style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;"><i class="fas fa-signal"></i> Status das Máquinas (Consolidado)</h3>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                            ${statusHtml}
                        </div>
                    </div>
                </div>
            `;
        } else {
            const addr = getAddressForPdv(selectedPdv);
            const zonaInfo = getZonaForPdv(selectedPdv);
            const rent = getRentForPdv(selectedPdv);
            
            // Get machine statuses for this PDV (group by machine/torre for latest status)
            const pdvMachines = {};
            if (typeof operationalMachineStatus !== 'undefined') {
                operationalMachineStatus.forEach(m => {
                    const key = normalizeKey(m.pdv);
                    const selKey = normalizeKey(selectedPdv);
                    if (key === selKey) {
                        const mKey = `${m.torre} - ${m.maquina}`;
                        if (!pdvMachines[mKey]) {
                            pdvMachines[mKey] = {
                                torre: m.torre,
                                tipo: m.maquina,
                                status: m.status,
                                data: m.data,
                                hora: m.hora
                            };
                        }
                    }
                });
            }
            
            let statusHtml = "";
            const mKeys = Object.keys(pdvMachines);
            if (mKeys.length > 0) {
                mKeys.forEach(mKey => {
                    const m = pdvMachines[mKey];
                    const stLower = m.status.toLowerCase();
                    const color = stLower === 'disponivel' || stLower === 'disponível' ? '#10b981' : (stLower === 'manutencao' || stLower === 'manutenção' ? '#ef4444' : '#f59e0b');
                    statusHtml += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #f1f5f9;">
                            <span style="font-size: 13px; font-weight: 600; color: var(--text-primary);"><i class="fas fa-soap" style="color: var(--color-wash); margin-right: 6px;"></i> ${m.torre} (${m.tipo})</span>
                            <span style="font-size: 12px; font-weight: 700; color: ${color};"><i class="fas fa-circle" style="font-size: 8px; margin-right: 4px;"></i> ${m.status}</span>
                        </div>
                    `;
                });
            } else {
                statusHtml = '<div style="color: var(--text-muted); font-size: 13px; padding: 10px 0;">Nenhum status em tempo real encontrado.</div>';
            }
            
            infoPanel.style.display = 'block';
            infoPanel.innerHTML = `
                <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 24px;">
                    <div>
                        <h3 style="font-size: 17px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;"><i class="fas fa-map-marker-alt" style="color: #ef4444; margin-right: 6px;"></i> ${selectedPdv}</h3>
                        <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 14px; line-height: 1.4;"><strong>Endereço:</strong> ${addr}</p>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                            <span class="btn-range" style="background: rgba(37, 99, 235, 0.1); color: var(--color-wash); font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px;">Região: ${zonaInfo.zona}</span>
                            <span class="btn-range" style="background: rgba(16, 185, 129, 0.1); color: #10b981; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px;">Máquinas: ${zonaInfo.maquinas}</span>
                            <span class="btn-range" style="background: rgba(245, 158, 11, 0.1); color: #d97706; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px;">Aluguel: R$ ${rent.toFixed(2).replace('.', ',')}/mês</span>
                        </div>
                    </div>
                    <div style="border-left: 1px solid var(--border-color); padding-left: 20px;">
                        <h3 style="font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px;"><i class="fas fa-signal" style="color: #10b981; margin-right: 6px;"></i> Status em Tempo Real</h3>
                        <div style="display: flex; flex-direction: column; gap: 2px;">
                            ${statusHtml}
                        </div>
                    </div>
                </div>
            `;
        }
    }
}

// Update Reservoir Display
function updateReservoirsUI() {
    const periodWashCycles = filteredData.filter(d => d.tipoMaquina === 'Lavadora').length;
    const selectedPdv = document.getElementById('filter-pdv').value;
    const divisor = selectedPdv === 'all' ? Math.max(1, activePdvsInMonth.length) : 1; 
    
    const detConsumed = periodWashCycles * DET_CONSUMPTION_PER_CYCLE;
    const amaConsumed = periodWashCycles * AMA_CONSUMPTION_PER_CYCLE;
    
    const detergenteLevel = Math.max(0, INITIAL_RESERVOIR_ML - (detConsumed / divisor));
    const amacianteLevel = Math.max(0, INITIAL_RESERVOIR_ML - (amaConsumed / divisor));
    
    // Percentages
    const detPct = ((detergenteLevel / INITIAL_RESERVOIR_ML) * 100).toFixed(1);
    const amaPct = ((amacianteLevel / INITIAL_RESERVOIR_ML) * 100).toFixed(1);
    
    // Liters
    const detLiters = (detergenteLevel / 1000).toFixed(2);
    const amaLiters = (amacianteLevel / 1000).toFixed(2);
    
    // Update DOM levels
    const detLiquid = document.getElementById('det-liquid');
    if (detLiquid) detLiquid.style.height = `${detPct}%`;
    
    const detVolEl = document.getElementById('det-vol');
    if (detVolEl) detVolEl.innerText = `${detLiters} L`;
    
    const detPctEl = document.getElementById('det-pct');
    if (detPctEl) detPctEl.innerText = `${detPct}%`;
    
    const amaLiquid = document.getElementById('ama-liquid');
    if (amaLiquid) amaLiquid.style.height = `${amaPct}%`;
    
    const amaVolEl = document.getElementById('ama-vol');
    if (amaVolEl) amaVolEl.innerText = `${amaLiters} L`;
    
    const amaPctEl = document.getElementById('ama-pct');
    if (amaPctEl) amaPctEl.innerText = `${amaPct}%`;
    
    // Show warnings if low (less than 15%)
    const detWarning = document.getElementById('det-warning');
    if (detWarning) {
        if (parseFloat(detPct) < 15) {
            detWarning.style.display = 'block';
            detWarning.innerText = "Nível Crítico!";
        } else {
            detWarning.style.display = 'none';
        }
    }
    
    const amaWarning = document.getElementById('ama-warning');
    if (amaWarning) {
        if (parseFloat(amaPct) < 15) {
            amaWarning.style.display = 'block';
            amaWarning.innerText = "Nível Crítico!";
        } else {
            amaWarning.style.display = 'none';
        }
    }
    
    // Dynamic stats of total consumption in current selection
    const periodDetConsumed = detConsumed / 1000;
    const periodAmaConsumed = amaConsumed / 1000;
    
    const detConsumedEl = document.getElementById('det-consumed-info');
    if (detConsumedEl) {
        detConsumedEl.innerText = selectedPdv === 'all' 
            ? `Consumo Total: ${periodDetConsumed.toFixed(2)} L (Média: ${(periodDetConsumed/divisor).toFixed(2)} L)`
            : `Consumido: ${periodDetConsumed.toFixed(2)} L`;
    }
    
    const amaConsumedEl = document.getElementById('ama-consumed-info');
    if (amaConsumedEl) {
        amaConsumedEl.innerText = selectedPdv === 'all' 
            ? `Consumo Total: ${periodAmaConsumed.toFixed(2)} L (Média: ${(periodAmaConsumed/divisor).toFixed(2)} L)`
            : `Consumido: ${periodAmaConsumed.toFixed(2)} L`;
    }
}

// Chart Renderings
function renderCharts() {
    renderDailyCyclesChart();
    renderPeakTimesChart();
    renderPaymentChart();
}

// 1. Daily Cycles Chart
function renderDailyCyclesChart() {
    const daysMap = {};
    
    let tempDate = new Date(selectedStartDate);
    while (tempDate <= selectedEndDate) {
        const dStr = formatDateString(tempDate);
        daysMap[dStr] = { wash: 0, dry: 0, total: 0 };
        tempDate.setDate(tempDate.getDate() + 1);
    }
    
    filteredData.forEach(item => {
        const dateStr = item.dayStr;
        if (daysMap[dateStr]) {
            if (item.tipoMaquina === 'Lavadora') {
                daysMap[dateStr].wash += 1;
            } else if (item.tipoMaquina === 'Secadora') {
                daysMap[dateStr].dry += 1;
            }
            daysMap[dateStr].total += 1;
        }
    });
    
    const sortedDates = Object.keys(daysMap).sort((a,b) => {
        return parseDateString(a).getTime() - parseDateString(b).getTime();
    });
    
    const washSeries = [];
    const drySeries = [];
    const totalSeries = [];
    
    sortedDates.forEach(d => {
        washSeries.push(daysMap[d].wash);
        drySeries.push(daysMap[d].dry);
        totalSeries.push(daysMap[d].total);
    });
    
    const options = {
        series: [
            { name: 'Lavagens', data: washSeries, color: '#2563eb' },
            { name: 'Secagens', data: drySeries, color: '#7c3aed' },
            { name: 'Total de Ciclos', data: totalSeries, color: '#10b981' }
        ],
        chart: {
            type: 'area',
            height: 310,
            background: 'transparent',
            toolbar: { show: false },
            zoom: { enabled: false }
        },
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: 3 },
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.25,
                opacityTo: 0.02,
                stops: [0, 90, 100]
            }
        },
        theme: { mode: 'light' },
        xaxis: {
            categories: sortedDates.map(d => d.substring(0, 5)),
            labels: {
                style: { colors: '#64748b', fontFamily: 'Plus Jakarta Sans', fontWeight: 600 }
            },
            axisBorder: { show: false },
            axisTicks: { show: false }
        },
        yaxis: {
            labels: {
                style: { colors: '#64748b', fontFamily: 'Plus Jakarta Sans', fontWeight: 600 }
            }
        },
        grid: {
            borderColor: 'rgba(30, 64, 175, 0.08)',
            strokeDashArray: 4
        },
        legend: {
            position: 'top',
            horizontalAlign: 'right',
            labels: { colors: '#0f172a', fontFamily: 'Plus Jakarta Sans', fontWeight: 600 },
            markers: { radius: 6 }
        },
        tooltip: {
            theme: 'dark'
        }
    };
    
    if (cyclesChartInstance) {
        cyclesChartInstance.updateOptions(options);
    } else {
        cyclesChartInstance = new ApexCharts(document.querySelector("#chart-cycles-daily"), options);
        cyclesChartInstance.render();
    }
}

function formatDateString(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

// 2. Peak Times Chart
function renderPeakTimesChart() {
    const hoursCount = Array(24).fill(0);
    
    filteredData.forEach(item => {
        const hour = parseInt(item.hora.split(':')[0], 10);
        if (hour >= 0 && hour < 24) {
            hoursCount[hour] += 1;
        }
    });
    
    const hoursCategories = [];
    const dataSeries = [];
    
    for (let h = 7; h <= 23; h++) {
        hoursCategories.push(`${String(h).padStart(2, '0')}h`);
        dataSeries.push(hoursCount[h]);
    }
    
    const options = {
        series: [{
            name: 'Ciclos Iniciados',
            data: dataSeries
        }],
        chart: {
            type: 'bar',
            height: 310,
            background: 'transparent',
            toolbar: { show: false }
        },
        plotOptions: {
            bar: {
                borderRadius: 5,
                columnWidth: '60%',
                distributed: true,
                colors: {
                    ranges: [
                        { from: 0, to: 2, color: 'rgba(37, 99, 235, 0.45)' },
                        { from: 3, to: 6, color: 'rgba(37, 99, 235, 0.7)' },
                        { from: 7, to: 99, color: 'var(--color-wash)' }
                    ]
                }
            }
        },
        dataLabels: { enabled: false },
        theme: { mode: 'light' },
        xaxis: {
            categories: hoursCategories,
            labels: {
                style: { colors: '#64748b', fontFamily: 'Plus Jakarta Sans', fontSize: '11px', fontWeight: 600 }
            },
            axisBorder: { show: false },
            axisTicks: { show: false }
        },
        yaxis: {
            labels: {
                style: { colors: '#64748b', fontFamily: 'Plus Jakarta Sans', fontWeight: 600 }
            }
        },
        grid: {
            borderColor: 'rgba(30, 64, 175, 0.08)',
            strokeDashArray: 4
        },
        legend: { show: false },
        tooltip: {
            theme: 'dark'
        }
    };
    
    if (peakTimesChartInstance) {
        peakTimesChartInstance.updateOptions(options);
    } else {
        peakTimesChartInstance = new ApexCharts(document.querySelector("#chart-peak-times"), options);
        peakTimesChartInstance.render();
    }
}

// 3. Payment Method Chart
function renderPaymentChart() {
    let pixCount = 0;
    let creditCount = 0;
    let debitCount = 0;
    
    filteredData.forEach(item => {
        const pag = (item.pagamento || '').toLowerCase();
        const brand = (item.bandeira || '').toLowerCase();
        
        if (pag === 'pix' || brand.includes('pix')) {
            pixCount += 1;
        } else if (brand.includes('debit') || brand.includes('electron') || brand.includes('maestro') || brand.includes('debito')) {
            debitCount += 1;
        } else if (brand.includes('credit') || brand.includes('credito') || brand.includes('visa') || brand.includes('master') || brand.includes('elo') || brand.includes('amex') || brand.includes('hipercard') || brand.includes('private label')) {
            creditCount += 1;
        } else {
            if (pag === 'tef') {
                creditCount += 1;
            } else {
                pixCount += 1;
            }
        }
    });
    
    const options = {
        series: [pixCount, creditCount, debitCount],
        labels: ['PIX', 'Cartão Crédito', 'Cartão Débito'],
        colors: ['#10b981', '#7c3aed', '#2563eb'],
        chart: {
            type: 'donut',
            height: 300,
            background: 'transparent'
        },
        stroke: { show: true, colors: ['#ffffff'], width: 2 },
        plotOptions: {
            pie: {
                donut: {
                    size: '72%',
                    labels: {
                        show: true,
                        name: {
                            show: true,
                            fontFamily: 'Outfit',
                            color: '#64748b',
                            offsetY: -10
                        },
                        value: {
                            show: true,
                            fontFamily: 'Outfit',
                            fontSize: '22px',
                            fontWeight: '700',
                            color: '#0f172a',
                            offsetY: 10,
                            formatter: function (val) { return val; }
                        },
                        total: {
                            show: true,
                            label: 'Total Ciclos',
                            color: '#64748b',
                            fontFamily: 'Outfit',
                            formatter: function (w) {
                                return w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                            }
                        }
                    }
                }
            }
        },
        theme: { mode: 'light' },
        legend: {
            position: 'bottom',
            labels: { colors: '#0f172a', fontFamily: 'Plus Jakarta Sans', fontWeight: 600 }
        },
        tooltip: {
            theme: 'dark'
        }
    };
    
    if (paymentChartInstance) {
        paymentChartInstance.updateOptions(options);
    } else {
        paymentChartInstance = new ApexCharts(document.querySelector("#chart-payment-methods"), options);
        paymentChartInstance.render();
    }
    
    updateBandeirasInfo();
}

function updateBandeirasInfo() {
    const brandsMap = {};
    filteredData.forEach(item => {
        const brand = item.bandeira.trim() || 'Outros';
        brandsMap[brand] = (brandsMap[brand] || 0) + 1;
    });
    
    const brandsSorted = Object.keys(brandsMap).sort((a,b) => brandsMap[b] - brandsMap[a]);
    const container = document.getElementById('bandeiras-list');
    
    if (!container) return;
    
    let html = '';
    brandsSorted.forEach(brand => {
        const count = brandsMap[brand];
        const pct = filteredData.length > 0 ? ((count / filteredData.length) * 100).toFixed(1) : 0;
        
        let iconHtml = '<i class="far fa-credit-card"></i>';
        if (brand.toLowerCase() === 'pix') {
            iconHtml = '<i class="fas fa-qrcode" style="color: #10b981;"></i>';
        } else if (brand.toLowerCase().includes('visa')) {
            iconHtml = '<i class="fab fa-cc-visa" style="color: #2563eb;"></i>';
        } else if (brand.toLowerCase().includes('master')) {
            iconHtml = '<i class="fab fa-cc-mastercard" style="color: #ea580c;"></i>';
        } else if (brand.toLowerCase().includes('amex')) {
            iconHtml = '<i class="fab fa-cc-amex" style="color: #0d9488;"></i>';
        }
        
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 4px; border-bottom: 1px solid #f1f5f9;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    ${iconHtml}
                    <span style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${brand}</span>
                </div>
                <div style="text-align: right;">
                    <span style="font-size: 13px; font-weight: 700; color: var(--text-primary);">${count} trans.</span>
                    <div style="font-size: 11px; color: var(--text-muted); font-weight: 500;">${pct}%</div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html || '<div style="color: var(--text-muted); text-align: center; padding: 20px;">Nenhum dado</div>';
}

// Excel CSV Export Functionality
function exportToExcel() {
    if (filteredData.length === 0) {
        alert("Nenhum dado disponível para exportar.");
        return;
    }
    
    let csvContent = "\uFEFF"; 
    csvContent += "Data;Hora;PDV;Equipamento;Operação;Meio Pagamento;Bandeira;Valor Venda R$;Total Venda R$;Cód. Autorização\r\n";
    
    filteredData.forEach(row => {
        const line = [
            row.data,
            row.hora,
            row.pdv,
            row.mola,
            row.tipoMaquina,
            row.pagamento,
            row.bandeira,
            row.venda.toFixed(2).replace('.', ','),
            row.total.toFixed(2).replace('.', ','),
            row.autorizacao || ""
        ].join(";");
        csvContent += line + "\r\n";
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    const startStr = formatDateToISO(selectedStartDate).replace(/-/g, "");
    const endStr = formatDateToISO(selectedEndDate).replace(/-/g, "");
    const selectedPdvName = document.getElementById('filter-pdv').value.replace(/[^a-zA-Z0-9]/g, "_");
    
    link.setAttribute("href", url);
    link.setAttribute("download", `dashboard_lavai_export_${selectedPdvName}_${startStr}_a_${endStr}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Table functions
function setupTableListeners() {
    const searchInput = document.getElementById('table-search');
    searchInput.addEventListener('input', () => {
        currentPage = 1;
        updateTable();
    });
    
    const exportBtn = document.getElementById('btn-export-excel');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToExcel);
    }
    
    const headers = document.querySelectorAll('th[data-sort]');
    headers.forEach(th => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
            const col = th.getAttribute('data-sort');
            if (sortedColumn === col) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortedColumn = col;
                sortDirection = 'asc';
            }
            
            headers.forEach(h => {
                const icon = h.querySelector('i');
                if (icon) icon.className = 'fas fa-sort';
            });
            
            const currentIcon = th.querySelector('i');
            if (currentIcon) {
                currentIcon.className = sortDirection === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
            }
            
            updateTable();
        });
    });
}

function updateTable() {
    const query = document.getElementById('table-search').value.toLowerCase().trim();
    
    let rows = filteredData.filter(item => {
        return (
            (item.mola || '').toLowerCase().includes(query) ||
            (item.tipoMaquina || '').toLowerCase().includes(query) ||
            (item.bandeira || '').toLowerCase().includes(query) ||
            (item.pagamento || '').toLowerCase().includes(query) ||
            (item.data || '').includes(query) ||
            (item.total || 0).toString().includes(query) ||
            (item.autorizacao || '').toLowerCase().includes(query) ||
            (item.pdv || '').toLowerCase().includes(query)
        );
    });
    
    rows.sort((a, b) => {
        let valA = a[sortedColumn];
        let valB = b[sortedColumn];
        
        if (sortedColumn === 'data') {
            valA = a.dateObj.getTime();
            valB = b.dateObj.getTime();
        }
        
        if (typeof valA === 'string') {
            return sortDirection === 'asc' 
                ? valA.localeCompare(valB) 
                : valB.localeCompare(valA);
        } else {
            return sortDirection === 'asc' 
                ? valA - valB 
                : valB - valA;
        }
    });
    
    const totalRows = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;
    
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, totalRows);
    const paginatedRows = rows.slice(startIndex, endIndex);
    
    const tbody = document.getElementById('tbody-transactions');
    tbody.innerHTML = '';
    
    if (paginatedRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px 0;">Nenhuma transação encontrada</td></tr>`;
        updatePaginationUI(0, 0, 0, 1);
        return;
    }
    
    paginatedRows.forEach(row => {
        const isWash = row.tipoMaquina === 'Lavadora';
        const machineClass = isWash ? 'wash' : 'dry';
        const machineIcon = isWash ? 'fa-tint' : 'fa-wind';
        
        const paymentClass = row.pagamento.toLowerCase() === 'pix' ? 'pix' : 'tef';
        
        tbody.innerHTML += `
            <tr>
                <td style="font-weight: 600;">${row.data} <span style="font-size: 11px; color: var(--text-muted); font-weight: normal; margin-left: 6px;">${row.hora}</span></td>
                <td style="font-weight: 600; color: #1e3a8a;">${row.pdv}</td>
                <td>
                    <span class="row-machine-badge ${machineClass}">
                        <i class="fas ${machineIcon}"></i> ${row.tipoMaquina}
                    </span>
                    <span style="font-size: 11px; color: var(--text-muted); margin-left: 6px;">(${row.mola.split(' ')[0]})</span>
                </td>
                <td>
                    <span class="payment-badge ${paymentClass}">${row.pagamento}</span>
                </td>
                <td class="brand-tag" style="font-weight: 500;">
                    ${getBrandIcon(row.bandeira)}
                    <span>${row.bandeira}</span>
                </td>
                <td style="font-family: var(--font-heading); font-weight: 700; color: #1e3a8a;">
                    ${formatCurrency(row.total)}
                </td>
                <td style="font-size: 11px; font-family: monospace; color: var(--text-muted); font-weight: 500;">${row.autorizacao || '-'}</td>
            </tr>
        `;
    });
    
    updatePaginationUI(startIndex + 1, endIndex, totalRows, totalPages);
}

function updatePaginationUI(startRow, endRow, totalRows, totalPages) {
    document.getElementById('pagination-info-text').innerText = `Exibindo ${startRow} a ${endRow} de ${totalRows} transações`;
    
    const pageButtonsContainer = document.getElementById('pagination-buttons-wrapper');
    pageButtonsContainer.innerHTML = '';
    
    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn-page';
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            updateTable();
        }
    });
    pageButtonsContainer.appendChild(prevBtn);
    
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }
    
    for (let p = startPage; p <= endPage; p++) {
        const pBtn = document.createElement('button');
        pBtn.className = `btn-page ${currentPage === p ? 'active' : ''}`;
        pBtn.innerText = p;
        pBtn.addEventListener('click', () => {
            currentPage = p;
            updateTable();
        });
        pageButtonsContainer.appendChild(pBtn);
    }
    
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn-page';
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            updateTable();
        }
    });
    pageButtonsContainer.appendChild(nextBtn);
}

function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

// Blue QR code custom icon for PDV markers
const blueIcon = L.icon({
    iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI1MCIgdmlld0JveD0iMCAwIDQwIDUwIj48cGF0aCBmaWxsPSIjMjU2M2ViIiBkPSJNMjAgMEMxMi4yNjcgMCA2IDYuMjY3IDYgMTRjMCA3IDEyIDMyIDEyIDMyczEyLTI1IDEyLTMyYzAtNy43MzMtNi4yNjctMTQtMTQtMTR6Ii8+PHJlY3QgeD0iMTIiIHk9IjEwIiB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIGZpbGw9IiNmZmYiIHJ4PSIxIi8+PHBhdHRlcm4gaWQ9InFyIiB3aWR0aD0iMiIgaGVpZ2h0PSIyIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cmVjdCB3aWR0aD0iMiIgaGVpZ2h0PSIyIiBmaWxsPSIjMjU2M2ViIi8+PHJlY3QgeD0iMSIgeT0iMSIgd2lkdGg9IjEiIGhlaWdodD0iMSIgZmlsbD0iI2ZmZiIvPjwvcGF0dGVybj48cmVjdCB4PSIxMiIgeT0iMTAiIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgZmlsbD0idXJsKCNxcikiIHJ4PSIxIi8+PC9zdmc+',
    iconSize: [40, 50],
    iconAnchor: [20, 50],
    popupAnchor: [0, -50]
});

function initializePdvMap() {
    const mapContainer = document.getElementById('pdv-map');
    if (!mapContainer) {
        console.error('Map container not found');
        return;
    }
    
    if (typeof L === 'undefined') {
        console.error('Leaflet library not loaded');
        return;
    }

    // Ensure container has dimensions
    mapContainer.style.width = '100%';
    mapContainer.style.height = '420px';
    mapContainer.style.minHeight = '420px';

    try {
        pdvMap = L.map(mapContainer, {
            attributionControl: true,
            zoomControl: true
        }).setView([-23.55, -46.63], 11);

        // OpenStreetMap standard layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(pdvMap);

        pdvMapMarkers = L.layerGroup().addTo(pdvMap);
        
        // Force size calculation
        setTimeout(() => {
            if (pdvMap) {
                pdvMap.invalidateSize();
                updatePdvMapMarkers();
            }
        }, 50);
    } catch (err) {
        console.error('Error initializing map:', err);
    }
}

function updatePdvMapMarkers() {
    if (!pdvMap || !pdvMapMarkers) return;
    pdvMapMarkers.clearLayers();

    const selectedPdv = document.getElementById('filter-pdv').value;
    const activePdvs = selectedPdv === 'all'
        ? [...new Set(filteredData.map(d => d.pdv))]
        : [selectedPdv];

    const bounds = [];

    activePdvs.forEach(pdv => {
        const coords = getCoordinatesForPdv(pdv);
        if (!coords) return;

        const statusCounts = {};
        if (typeof operationalMachineStatus !== 'undefined') {
            operationalMachineStatus.forEach(m => {
                if (normalizeKey(m.pdv) === normalizeKey(pdv)) {
                    statusCounts[m.status] = (statusCounts[m.status] || 0) + 1;
                }
            });
        }

        const statusHtml = Object.keys(statusCounts).length > 0
            ? Object.entries(statusCounts).map(([status, count]) => `<div style="font-size: 12px; margin-bottom: 2px;"><strong>${status}:</strong> ${count}</div>`).join('')
            : '<div style="font-size: 12px; color: #64748b;">Sem dados de status</div>';

        const popupContent = `
            <div style="font-size: 14px; font-weight: 700; margin-bottom: 6px;">${pdv}</div>
            <div style="font-size: 12px; color: #475569; margin-bottom: 6px;">${getAddressForPdv(pdv)}</div>
            <div style="font-size: 12px; margin-bottom: 6px;"><strong>Região:</strong> ${getZonaForPdv(pdv).zona}</div>
            <div style="font-size: 12px; margin-bottom: 6px;"><strong>Máquinas:</strong> ${getZonaForPdv(pdv).maquinas}</div>
            ${statusHtml}
            <button id="map-select-${normalizeKey(pdv)}" style="margin-top: 10px; padding: 8px 10px; border: none; border-radius: 6px; background: #2563eb; color: #fff; cursor: pointer; font-size: 12px; width: 100%;">Selecionar PDV</button>
        `;

        const marker = L.marker([coords.lat, coords.lon], { icon: blueIcon });
        marker.bindPopup(popupContent, { maxWidth: 280 });
        pdvMapMarkers.addLayer(marker);
        marker.on('popupopen', () => {
            setTimeout(() => {
                const btn = document.getElementById(`map-select-${normalizeKey(pdv)}`);
                if (btn) {
                    btn.addEventListener('click', () => {
                        const pdvSelect = document.getElementById('filter-pdv');
                        if (pdvSelect) {
                            pdvSelect.value = pdv;
                            applyFilters();
                        }
                    });
                }
            }, 10);
        });

        bounds.push([coords.lat, coords.lon]);
    });

    if (bounds.length) {
        pdvMap.fitBounds(bounds, { padding: [40, 40] });
    } else {
        pdvMap.setView([-23.55, -46.63], 11);
    }
}

function getBrandIcon(brand) {
    const b = brand.toLowerCase();
    if (b.includes('visa')) return '<i class="fab fa-cc-visa" style="color: #2563eb;"></i>';
    if (b.includes('master')) return '<i class="fab fa-cc-mastercard" style="color: #ea580c;"></i>';
    if (b.includes('amex')) return '<i class="fab fa-cc-amex" style="color: #0d9488;"></i>';
    if (b.includes('elo')) return '<i class="far fa-credit-card" style="color: #fb923c;"></i>';
    if (b.includes('pix')) return '<i class="fas fa-qrcode" style="color: #10b981;"></i>';
    return '<i class="far fa-credit-card" style="color: var(--text-muted);"></i>';
}

function setupTabToggling() {
    const tabOverviewBtn = document.getElementById('tab-overview');
    const tabCostsBtn = document.getElementById('tab-costs');
    const contentOverview = document.getElementById('content-overview');
    const contentCosts = document.getElementById('content-costs');
    
    if (tabOverviewBtn && tabCostsBtn && contentOverview && contentCosts) {
        tabOverviewBtn.addEventListener('click', () => {
            tabOverviewBtn.classList.add('active');
            tabCostsBtn.classList.remove('active');
            contentOverview.classList.add('active');
            contentCosts.classList.remove('active');
            renderCharts();
        });
        
        tabCostsBtn.addEventListener('click', () => {
            tabCostsBtn.classList.add('active');
            tabOverviewBtn.classList.remove('active');
            contentCosts.classList.add('active');
            contentOverview.classList.remove('active');
            updateCostsTabUI();
        });
    }
}

let costsChartInstance = null;

function updateCostsTabUI() {
    const selectedPdv = document.getElementById('filter-pdv').value;
    
    const timeDiff = selectedEndDate.getTime() - selectedStartDate.getTime();
    const daysSelected = Math.max(1, Math.floor(timeDiff / (1000 * 60 * 60 * 24)));
    
    const pdvDataMap = {};
    const targetPdvs = selectedPdv === 'all' ? activePdvsInMonth : (selectedPdv !== 'all' ? [selectedPdv] : []);
    
    targetPdvs.forEach(p => {
        pdvDataMap[p] = {
            pdv: p,
            washCycles: 0,
            dryCycles: 0,
            revenue: 0,
            rent: getRentForPdv(p) * (daysSelected / 30),
            visits: getCostsForPdv(p).total * (daysSelected / 30)
        };
    });
    
    filteredData.forEach(d => {
        const pdvObj = pdvDataMap[d.pdv];
        if (pdvObj) {
            pdvObj.revenue += d.total;
            if (d.tipoMaquina === 'Lavadora') {
                pdvObj.washCycles++;
            } else if (d.tipoMaquina === 'Secadora') {
                pdvObj.dryCycles++;
            }
        }
    });
    
    let totalRevenue = 0;
    let totalRent = 0;
    let totalVisits = 0;
    let totalChemicals = 0;
    let totalFees = 0;
    
    const tbody = document.getElementById('tbody-costs-margins');
    if (tbody) tbody.innerHTML = '';
    
    const pdvRows = Object.values(pdvDataMap).sort((a,b) => b.revenue - a.revenue);
    
    pdvRows.forEach(row => {
        const chemicals = row.washCycles * 0.50;
        const fees = row.revenue * 0.02;
        const totalCosts = row.rent + row.visits + chemicals + fees;
        const netProfit = row.revenue - totalCosts;
        const marginPct = row.revenue > 0 ? (netProfit / row.revenue) * 100 : 0;
        
        totalRevenue += row.revenue;
        totalRent += row.rent;
        totalVisits += row.visits;
        totalChemicals += chemicals;
        totalFees += fees;
        
        if (tbody) {
            tbody.innerHTML += `
                <tr>
                    <td style="font-weight: 600; color: #1e3a8a;">${row.pdv}</td>
                    <td style="font-weight: 500;">L: ${row.washCycles} / S: ${row.dryCycles}</td>
                    <td style="font-family: var(--font-heading); font-weight: 700; color: #1e3a8a;">${formatCurrency(row.revenue)}</td>
                    <td style="color: var(--text-secondary);">${formatCurrency(row.rent)}</td>
                    <td style="color: var(--text-secondary);">${formatCurrency(row.visits)}</td>
                    <td style="color: var(--text-secondary);">${formatCurrency(chemicals)}</td>
                    <td style="color: var(--text-secondary);">${formatCurrency(fees)}</td>
                    <td style="font-family: var(--font-heading); font-weight: 600; color: #b91c1c;">${formatCurrency(totalCosts)}</td>
                    <td style="font-family: var(--font-heading); font-weight: 700; color: ${netProfit >= 0 ? '#059669' : '#ef4444'};">${formatCurrency(netProfit)}</td>
                    <td>
                        <span style="font-weight: 700; color: ${marginPct >= 0 ? '#059669' : '#ef4444'};">${marginPct.toFixed(1)}%</span>
                    </td>
                </tr>
            `;
        }
    });
    
    const overallTotalCosts = totalRent + totalVisits + totalChemicals + totalFees;
    const overallNetProfit = totalRevenue - overallTotalCosts;
    const overallMarginPct = totalRevenue > 0 ? (overallNetProfit / totalRevenue) * 100 : 0;
    
    const krv = document.getElementById('cost-kpi-revenue-val');
    if (krv) krv.innerText = formatCurrency(totalRevenue);
    
    const kcv = document.getElementById('cost-kpi-costs-val');
    if (kcv) kcv.innerText = formatCurrency(overallTotalCosts);
    const kcs = document.getElementById('cost-kpi-costs-sub');
    if (kcs) kcs.innerText = `Referente a ${daysSelected} dias`;
    
    const kct = document.getElementById('cost-kpi-contrib-val');
    const contributionMargin = totalRevenue - (totalChemicals + totalFees);
    if (kct) kct.innerText = formatCurrency(contributionMargin);
    
    const kpv = document.getElementById('cost-kpi-profit-val');
    if (kpv) kpv.innerText = formatCurrency(overallNetProfit);
    const kps = document.getElementById('cost-kpi-profit-sub');
    if (kps) {
        kps.innerHTML = overallNetProfit >= 0 
            ? `<i class="fas fa-arrow-up" style="color: #10b981;"></i> <span>Lucro consolidado</span>`
            : `<i class="fas fa-arrow-down" style="color: #ef4444;"></i> <span>Prejuízo consolidado</span>`;
    }
    
    const kmv = document.getElementById('cost-kpi-margin-val');
    if (kmv) kmv.innerText = `${overallMarginPct.toFixed(1).replace('.', ',')}%`;
    const kms = document.getElementById('cost-kpi-margin-sub');
    if (kms) kms.innerText = `Retorno sobre receita bruta`;
    
    const dcr = document.getElementById('cost-detail-rent');
    if (dcr) dcr.innerText = formatCurrency(totalRent);
    
    const dcm = document.getElementById('cost-detail-maintenance');
    if (dcm) dcm.innerText = formatCurrency(totalVisits);
    
    const dcc = document.getElementById('cost-detail-chemicals');
    if (dcc) dcc.innerText = formatCurrency(totalChemicals);
    
    const dcf = document.getElementById('cost-detail-fees');
    if (dcf) dcf.innerText = formatCurrency(totalFees);
    
    const costsTab = document.getElementById('content-costs');
    if (costsTab && costsTab.classList.contains('active')) {
        renderCostsChart(totalRent, totalVisits, totalChemicals, totalFees);
    }
}

function renderCostsChart(rent, maintenance, chemicals, fees) {
    const chartContainer = document.getElementById('chart-costs-breakdown');
    if (!chartContainer) return;
    
    const options = {
        series: [parseFloat(rent.toFixed(2)), parseFloat(maintenance.toFixed(2)), parseFloat(chemicals.toFixed(2)), parseFloat(fees.toFixed(2))],
        labels: ['Aluguel', 'OPEX: Visita Técnica / Internet', 'Insumos Químicos', 'Taxas Processamento'],
        chart: {
            type: 'donut',
            height: 320,
            fontFamily: 'Outfit, sans-serif'
        },
        colors: ['#2563eb', '#d97706', '#10b981', '#0ea5e9'],
        legend: {
            position: 'bottom'
        },
        dataLabels: {
            enabled: true,
            formatter: function (val) {
                return val.toFixed(1) + "%"
            }
        },
        tooltip: {
            y: {
                formatter: function (val) {
                    return formatCurrency(val)
                }
            }
        },
        responsive: [{
            breakpoint: 480,
            options: {
                chart: {
                    width: 200
                },
                legend: {
                    position: 'bottom'
                }
            }
        }]
    };
    
    if (costsChartInstance) {
        costsChartInstance.destroy();
    }
    
    costsChartInstance = new ApexCharts(chartContainer, options);
    costsChartInstance.render();
}

function exportCostsToExcel() {
    const timeDiff = selectedEndDate.getTime() - selectedStartDate.getTime();
    const daysSelected = Math.max(1, Math.floor(timeDiff / (1000 * 60 * 60 * 24)));
    const selectedPdv = document.getElementById('filter-pdv').value;
    const targetPdvs = selectedPdv === 'all' ? activePdvsInMonth : (selectedPdv !== 'all' ? [selectedPdv] : []);
    
    const pdvDataMap = {};
    targetPdvs.forEach(p => {
        pdvDataMap[p] = {
            pdv: p,
            wash: 0,
            dry: 0,
            revenue: 0,
            rent: getRentForPdv(p) * (daysSelected / 30),
            visits: getCostsForPdv(p).total * (daysSelected / 30)
        };
    });
    
    filteredData.forEach(d => {
        const pdvObj = pdvDataMap[d.pdv];
        if (pdvObj) {
            pdvObj.revenue += d.total;
            if (d.tipoMaquina === 'Lavadora') {
                pdvObj.wash++;
            } else if (d.tipoMaquina === 'Secadora') {
                pdvObj.dry++;
            }
        }
    });
    
    const rows = [
        ["PDV", "Ciclos Lavagem", "Ciclos Secagem", "Receita Bruta (R$)", "Aluguel Prorrateado (R$)", "Visitas Tecnicas (R$)", "Insumos Quimicos (R$)", "Taxas Processamento (R$)", "Custos Totais (R$)", "Lucro Liquido (R$)", "Margem de Lucro (%)"]
    ];
    
    Object.values(pdvDataMap).forEach(row => {
        const chemicals = row.wash * 0.50;
        const fees = row.revenue * 0.02;
        const totalCosts = row.rent + row.visits + chemicals + fees;
        const netProfit = row.revenue - totalCosts;
        const marginPct = row.revenue > 0 ? (netProfit / row.revenue) * 100 : 0;
        
        rows.push([
            row.pdv,
            row.wash,
            row.dry,
            row.revenue.toFixed(2),
            row.rent.toFixed(2),
            row.visits.toFixed(2),
            chemicals.toFixed(2),
            fees.toFixed(2),
            totalCosts.toFixed(2),
            netProfit.toFixed(2),
            marginPct.toFixed(1) + "%"
        ]);
    });
    
    let csvContent = "\uFEFF";
    rows.forEach(row => {
        csvContent += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";") + "\r\n";
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    const startStr = formatDateToISO(selectedStartDate).replace(/-/g, "");
    const endStr = formatDateToISO(selectedEndDate).replace(/-/g, "");
    
    link.setAttribute("href", url);
    link.setAttribute("download", `laundry_costs_margins_${startStr}_a_${endStr}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
