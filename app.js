// Global State
let allData = [];
let filteredData = [];
let activeRange = 'all'; // 'all', '7days', '15days', 'month'
let selectedStartDate = null;
let selectedEndDate = null;

// Reservoir Constant Configurations
const INITIAL_RESERVOIR_ML = 20000; // 20 Liters
const DET_CONSUMPTION_PER_CYCLE = 50; // 50 ml
const AMA_CONSUMPTION_PER_CYCLE = 50; // 50 ml

// Chart instances
let cyclesChartInstance = null;
let peakTimesChartInstance = null;
let paymentChartInstance = null;

// Pagination state
let currentPage = 1;
const rowsPerPage = 10;
let sortedColumn = 'data';
let sortDirection = 'desc';

// Helper to convert DD/MM/YYYY date to Date Object
function parseDateString(dateStr, timeStr) {
    const parts = dateStr.split('/');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    
    if (timeStr) {
        const timeParts = timeStr.split(':');
        return new Date(year, month, day, parseInt(timeParts[0], 10), parseInt(timeParts[1], 10), parseInt(timeParts[2], 10));
    }
    return new Date(year, month, day);
}

// Load and Initialize Data
document.addEventListener('DOMContentLoaded', () => {
    // Show loader
    const loader = document.getElementById('loader');
    
    try {
        if (typeof rawLaundryData === 'undefined') {
            throw new Error("Dados não definidos. Certifique-se de que o data.js foi importado.");
        }
        
        allData = rawLaundryData.map(item => {
            const dateTime = parseDateString(item.data, item.hora);
            return {
                ...item,
                dateObj: dateTime,
                dayStr: item.data // backup of original DD/MM/YYYY string
            };
        });
        
        // Determine date boundary
        if (allData.length > 0) {
            // Find min and max date objects
            const dates = allData.map(d => d.dateObj.getTime());
            const minTime = dates.reduce((a, b) => a < b ? a : b);
            const maxTime = dates.reduce((a, b) => a > b ? a : b);
            
            selectedStartDate = new Date(minTime);
            selectedStartDate.setHours(0,0,0,0);
            
            selectedEndDate = new Date(maxTime);
            selectedEndDate.setHours(23,59,59,999);
        } else {
            selectedStartDate = new Date(2026, 5, 1);
            selectedEndDate = new Date(2026, 5, 30);
        }
        
        // Set date input elements
        document.getElementById('date-start').value = formatDateToISO(selectedStartDate);
        document.getElementById('date-end').value = formatDateToISO(selectedEndDate);
        
        // Setup Listeners
        setupFilterListeners();
        setupTableListeners();
        
        // Filter and update UI
        applyFilters();
        
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
            loaderText.innerHTML = `<span style="color: #ef4444;">Erro ao iniciar painel: ${err.message}</span>`;
        }
    }
});

// Helper: Format Date to ISO string (YYYY-MM-DD)
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

    // Month filter selector
    const monthSelect = document.getElementById('filter-month');
    monthSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'all') {
            document.getElementById('btn-range-all').click();
            return;
        }
        
        if (val === '06-2026') {
            setActiveRangeButton('month');
            selectedStartDate = new Date(2026, 5, 1, 0, 0, 0);
            selectedEndDate = new Date(2026, 5, 30, 23, 59, 59);
            
            startInput.value = formatDateToISO(selectedStartDate);
            endInput.value = formatDateToISO(selectedEndDate);
            applyFilters();
        }
    });
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
    filteredData = allData.filter(item => {
        const time = item.dateObj.getTime();
        return time >= selectedStartDate.getTime() && time <= selectedEndDate.getTime();
    });
    
    currentPage = 1;
    updateKPIs();
    updateReservoirsUI();
    renderCharts();
    updateTable();
}

// Calculate and Update KPI Card Values
function updateKPIs() {
    // Determine days in selected range
    const timeDiff = selectedEndDate.getTime() - selectedStartDate.getTime();
    const daysSelected = Math.max(1, Math.floor(timeDiff / (1000 * 60 * 60 * 24)));

    // Total Revenue (faturado)
    const totalRevenue = filteredData.reduce((acc, curr) => acc + curr.total, 0);
    document.getElementById('kpi-revenue-val').innerText = formatCurrency(totalRevenue);
    
    // Wash vs Dry Breakdowns
    const washCycles = filteredData.filter(d => d.tipoMaquina === 'Lavadora').length;
    const dryCycles = filteredData.filter(d => d.tipoMaquina === 'Secadora').length;
    
    document.getElementById('kpi-wash-val').innerText = washCycles;
    document.getElementById('kpi-dry-val').innerText = dryCycles;
    
    // Number of configured machines for Cunha Gago unit
    const numWashers = 1;
    const numDryers = 1;
    const numMolas = 2;

    // Daily Averages (compreendendo o total dividido por quantidade de molas e dias)
    const averageWashDaily = washCycles / (numWashers * daysSelected);
    const averageDryDaily = dryCycles / (numDryers * daysSelected);
    const averageCyclesDaily = filteredData.length / (numMolas * daysSelected);
    
    const avgCyclesBadge = document.getElementById('average-cycles-badge');
    if (avgCyclesBadge) {
        avgCyclesBadge.innerText = `Média: ${averageCyclesDaily.toFixed(2).replace('.', ',')} ciclos/dia`;
    }
    
    const washSub = document.getElementById('kpi-wash-sub');
    if (washSub) {
        washSub.innerText = `Média: ${averageWashDaily.toFixed(1).replace('.', ',')}/dia • Máquina 7727`;
    }
    
    const drySub = document.getElementById('kpi-dry-sub');
    if (drySub) {
        drySub.innerText = `Média: ${averageDryDaily.toFixed(1).replace('.', ',')}/dia • Máquina 17381`;
    }
    
    // Projeção de Faturamento (Revenue Projection)
    const daysInMonth = 30; // June 2026 has 30 days
    const dailyAverage = totalRevenue / daysSelected;
    const projectedRevenue = dailyAverage * daysInMonth;
    
    document.getElementById('kpi-projection-val').innerText = formatCurrency(projectedRevenue);
    document.getElementById('kpi-projection-sub').innerText = `Com base na média diária de R$ ${dailyAverage.toFixed(2).replace('.', ',')} (${daysSelected} dias selecionados)`;
    
    // Machine Occupancy / Taxa de ocupação (Baseada na capacidade máxima diária: Lavadora = 16/dia, Secadora = 14/dia)
    const maxWashesInPeriod = 16 * daysSelected;
    const maxDrysInPeriod = 14 * daysSelected;
    
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

        // 3. Day of Week Averaging (Wash average + Dry average) / 2
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
                
                // Number of configured machines for Cunha Gago unit
                const numMolasOnWeekday = 2;
                
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
    
    // Update DOM
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
}

// Update Reservoir Display (Dynamically calculated based on wash cycles in filtered selection)
function updateReservoirsUI() {
    const periodWashCycles = filteredData.filter(d => d.tipoMaquina === 'Lavadora').length;
    
    // Remaining volume (subtracting 50ml per cycle)
    const detergenteLevel = Math.max(0, INITIAL_RESERVOIR_ML - (periodWashCycles * DET_CONSUMPTION_PER_CYCLE));
    const amacianteLevel = Math.max(0, INITIAL_RESERVOIR_ML - (periodWashCycles * AMA_CONSUMPTION_PER_CYCLE));
    
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
    
    // Dynamic stats of consumption in current period
    const periodDetConsumed = (periodWashCycles * DET_CONSUMPTION_PER_CYCLE) / 1000;
    const periodAmaConsumed = (periodWashCycles * AMA_CONSUMPTION_PER_CYCLE) / 1000;
    
    const detConsumedEl = document.getElementById('det-consumed-info');
    if (detConsumedEl) detConsumedEl.innerText = `Consumido: ${periodDetConsumed.toFixed(2)} L`;
    
    const amaConsumedEl = document.getElementById('ama-consumed-info');
    if (amaConsumedEl) amaConsumedEl.innerText = `Consumido: ${periodAmaConsumed.toFixed(2)} L`;
}

// Chart Renderings (Light Theme)
function renderCharts() {
    renderDailyCyclesChart();
    renderPeakTimesChart();
    renderPaymentChart();
}

// 1. Daily Cycles Chart (Area Chart)
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
            labels: { colors: '#0f172a', fontFamily: 'Outfit', fontWeight: 600 },
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

// Helper: Format date object to "DD/MM/YYYY" string
function formatDateString(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

// 2. Peak Times Chart (Bar Chart)
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

// 3. Payment Method Chart (Donut Chart)
function renderPaymentChart() {
    let pixCount = 0;
    let creditCount = 0;
    let debitCount = 0;
    
    filteredData.forEach(item => {
        const cardType = item.tipoCartao.toLowerCase();
        if (item.pagamento.toLowerCase() === 'pix' || cardType === 'pix') {
            pixCount += 1;
        } else if (cardType === 'credit') {
            creditCount += 1;
        } else if (cardType === 'debit') {
            debitCount += 1;
        } else {
            if (item.pagamento.toLowerCase() === 'tef') {
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

// Details list of credit/debit card brands and counts
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
        const pct = ((count / filteredData.length) * 100).toFixed(1);
        
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

// Excel CSV Export Functionality (Brazilian formatting, BOM for Excel support)
function exportToExcel() {
    if (filteredData.length === 0) {
        alert("Nenhum dado disponível para exportar.");
        return;
    }
    
    // Semicolon separated values and BOM header for perfect Excel opening in Portuguese Windows
    let csvContent = "\uFEFF"; 
    csvContent += "Data;Hora;Equipamento;Operação;Meio Pagamento;Bandeira;Valor Venda R$;Total Venda R$;Cód. Autorização\r\n";
    
    filteredData.forEach(row => {
        const line = [
            row.data,
            row.hora,
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
    
    link.setAttribute("href", url);
    link.setAttribute("download", `dashboard_lavai_export_${startStr}_a_${endStr}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Table functions: searching, sorting, pagination
function setupTableListeners() {
    // Search listener
    const searchInput = document.getElementById('table-search');
    searchInput.addEventListener('input', () => {
        currentPage = 1;
        updateTable();
    });
    
    // Excel export button listener
    const exportBtn = document.getElementById('btn-export-excel');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToExcel);
    }
    
    // Header click sorting
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
            item.mola.toLowerCase().includes(query) ||
            item.tipoMaquina.toLowerCase().includes(query) ||
            item.bandeira.toLowerCase().includes(query) ||
            item.pagamento.toLowerCase().includes(query) ||
            item.data.includes(query) ||
            item.total.toString().includes(query) ||
            item.autorizacao.toLowerCase().includes(query)
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
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 40px 0;">Nenhuma transação encontrada</td></tr>`;
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

// Pagination Controls UI Helper
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

// Helper: Format Currency to BRL
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

// Helper: Get brand brand-specific icon
function getBrandIcon(brand) {
    const b = brand.toLowerCase();
    if (b.includes('visa')) return '<i class="fab fa-cc-visa" style="color: #2563eb;"></i>';
    if (b.includes('master')) return '<i class="fab fa-cc-mastercard" style="color: #ea580c;"></i>';
    if (b.includes('amex')) return '<i class="fab fa-cc-amex" style="color: #0d9488;"></i>';
    if (b.includes('elo')) return '<i class="far fa-credit-card" style="color: #fb923c;"></i>';
    if (b.includes('pix')) return '<i class="fas fa-qrcode" style="color: #10b981;"></i>';
    return '<i class="far fa-credit-card" style="color: var(--text-muted);"></i>';
}
