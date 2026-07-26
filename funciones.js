// Registrar plugin de etiquetas para barras globalmente
Chart.register(ChartDataLabels);

// 1. CONFIGURACIÓN
const API_URL = 'http://localhost:3000/api';
let chartInstance = null;
let relojInstance = null;
let barrasInstance = null;
let barrasResultadosInstance = null;
let allData = [];
let datosFiltradosActuales = []; // NUEVO: Para guardar el estado de los datos filtrados y repintar gráficos

// 2. NAVEGACIÓN ENTRE PESTAÑAS
function switchTab(tab) {
    document.getElementById('vista-dashboard').classList.toggle('hidden', tab !== 'dashboard');
    document.getElementById('vista-registro').classList.toggle('hidden', tab !== 'registro');
    
    document.getElementById('btn-dashboard').className = tab === 'dashboard' ? 'bg-blue-600 px-4 py-2 rounded font-semibold transition' : 'bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded font-semibold transition';
    document.getElementById('btn-registro').className = tab === 'registro' ? 'bg-blue-600 px-4 py-2 rounded font-semibold transition' : 'bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded font-semibold transition';
    
    if (tab === 'dashboard') loadData(); // Recargar datos al volver
}

// 3. MOTOR DE CÁLCULO
function actualizarTiempoTotal() {
    const mesInput = document.getElementById('mes').value;
    if (mesInput) {
        const partes = mesInput.split('-');
        const anio = parseInt(partes[0]);
        const mes = parseInt(partes[1]);
        const diasEnMes = new Date(anio, mes, 0).getDate();
        const horasTotales = diasEnMes * 24;
        
        document.getElementById('tiempoTotal').value = horasTotales;
        calcularVivo();
    }
}

function verificarDuplicado() {
    const mesInput = document.getElementById('mes').value;
    const equipoInput = document.getElementById('equipo').value;
    const btnSubmit = document.getElementById('btn-submit');
    const warningDiv = document.getElementById('warning-duplicado');

    if (!mesInput || !equipoInput) return;

    const existeDuplicado = allData.some(r => r.mes === mesInput && r.equipo.toLowerCase() === equipoInput.toLowerCase());

    if (existeDuplicado) {
        warningDiv.classList.remove('hidden');
        btnSubmit.disabled = true;
        btnSubmit.classList.add('bg-slate-400', 'cursor-not-allowed');
        btnSubmit.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        btnSubmit.textContent = 'Bloqueado: Mes ya registrado'; // Cambia el texto del botón
    } else {
        warningDiv.classList.add('hidden');
        btnSubmit.disabled = false;
        btnSubmit.classList.remove('bg-slate-400', 'cursor-not-allowed');
        btnSubmit.classList.add('bg-blue-600', 'hover:bg-blue-700');
        btnSubmit.textContent = 'Guardar en Base de Datos'; // Restaura el texto original
    }
}

function calcularKPIs() {
    const tTotal = Number(document.getElementById('tiempoTotal').value) || 0;
    const dtProg = Number(document.getElementById('dtProgramado').value) || 0;
    const dtNoProg = Number(document.getElementById('dtNoProgramado').value) || 0;
    const idle = Number(document.getElementById('idleTime').value) || 0;
    const capNom = Number(document.getElementById('capNominal').value) || 1;
    const capAct = Number(document.getElementById('capActual').value) || 0;
    const pTotal = Number(document.getElementById('prodTotal').value) || 1;
    const pMala = Number(document.getElementById('prodMala').value) || 0;

    const uptime = tTotal - dtProg - dtNoProg - idle;
    const tiempoOperativoPlaneado = tTotal - idle;

    const disponibilidad = tiempoOperativoPlaneado > 0 ? (uptime / tiempoOperativoPlaneado) : 0;
    const eficiencia = capAct / capNom;
    const calidad = pTotal > 0 ? ((pTotal - pMala) / pTotal) : 0;
    const utilizacion = tTotal > 0 ? (tiempoOperativoPlaneado / tTotal) : 0;

    const oee = disponibilidad * eficiencia * calidad;
    const teep = oee * utilizacion;

    return { uptime, disponibilidad, eficiencia, calidad, utilizacion, oee, teep };
}

function calcularVivo() {
    const kpis = calcularKPIs();
    const format = (val) => (val * 100).toFixed(1) + '%';
    document.getElementById('uptime-val').textContent = kpis.uptime.toFixed(1) + ' Horas';
    document.getElementById('prev-uptime').textContent = kpis.uptime.toFixed(1) + ' Hrs';
    document.getElementById('prev-disp').textContent = format(kpis.disponibilidad);
    document.getElementById('prev-efic').textContent = format(kpis.eficiencia);
    document.getElementById('prev-cal').textContent = format(kpis.calidad);
    document.getElementById('prev-util').textContent = format(kpis.utilizacion);
    document.getElementById('prev-oee').textContent = format(kpis.oee);
    document.getElementById('prev-teep').textContent = format(kpis.teep);
}

// 4. GUARDAR EN BASE DE DATOS (POST)
document.getElementById('kpiForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const mesInput = document.getElementById('mes').value;
    const equipoInput = document.getElementById('equipo').value;

    const existeDuplicado = allData.some(r => r.mes === mesInput && r.equipo.toLowerCase() === equipoInput.toLowerCase());
    if (existeDuplicado) {
        alert(`Error: Ya existe un registro para el equipo "${equipoInput}" en el mes de ${mesInput}. Por favor, elimina el registro existente primero o elige un mes distinto.`);
        return;
    }

    const inputsNumericos = ['tiempoTotal', 'dtProgramado', 'dtNoProgramado', 'idleTime', 'capNominal', 'capActual', 'prodTotal', 'prodMala'];
    for (let id of inputsNumericos) {
        if (Number(document.getElementById(id).value) < 0) {
            alert("Error de validación: No se permiten valores menores a cero en el registro de tiempos ni producción.");
            return;
        }
    }

    const kpis = calcularKPIs();
    const payload = {
        mes: mesInput,
        equipo: equipoInput,
        parametro: document.getElementById('parametro').value,
        tiempoTotal: document.getElementById('tiempoTotal').value,
        dtProgramado: document.getElementById('dtProgramado').value,
        dtNoProgramado: document.getElementById('dtNoProgramado').value,
        idleTime: document.getElementById('idleTime').value,
        capacidadNominal: document.getElementById('capNominal').value,
        capacidadActual: document.getElementById('capActual').value,
        produccionTotal: document.getElementById('prodTotal').value,
        produccionMala: document.getElementById('prodMala').value,
        ...kpis
    };

    try {
        const res = await fetch(`${API_URL}/kpis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const contentType = res.headers.get("content-type");
        if(res.ok && contentType && contentType.includes("application/json")) {
            alert("¡Guardado en MySQL exitosamente!");
            switchTab('dashboard');
        } else {
            alert("Error al guardar. Verifica que el servidor (node server.js) esté encendido y funcionando.");
        }
    } catch (err) {
        alert("Error de conexión con la API Backend. ¿Está ejecutándose el servidor en localhost:3000?");
        console.error(err);
    }
});

// 5. BORRAR REGISTRO (DELETE)
async function eliminar(id) {
    if(!confirm("¿Seguro que deseas eliminar este mes?")) return;
    try {
        await fetch(`${API_URL}/kpis/${id}`, { method: 'DELETE' });
        loadData();
    } catch (err) {
        console.error(err);
    }
}

// 6. CARGAR DATOS DESDE MYSQL (GET) Y FILTRADO
async function loadData() {
    try {
        const res = await fetch(`${API_URL}/kpis`);
        const contentType = res.headers.get("content-type");
        
        if (!res.ok || !contentType || !contentType.includes("application/json")) {
            throw new Error("El servidor no devolvió JSON válido o está apagado.");
        }
        
        allData = await res.json();
        aplicarFiltro(); 
        verificarDuplicado();
    } catch (err) {
        console.error("Error cargando datos:", err);
        
        const mockData = [
            { id: 1, mes: "2026-05", equipo: "Línea Demo", disponibilidad: 0.85, eficiencia: 0.90, calidad: 0.95, utilizacion: 0.89, oee: 0.726, teep: 0.65 },
            { id: 2, mes: "2026-06", equipo: "Línea Demo", disponibilidad: 0.88, eficiencia: 0.92, calidad: 0.96, utilizacion: 0.91, oee: 0.777, teep: 0.71 },
            { id: 3, mes: "2026-07", equipo: "Línea Demo", disponibilidad: 0.90, eficiencia: 0.95, calidad: 0.98, utilizacion: 0.90, oee: 0.837, teep: 0.75 }
        ];
        
        allData = mockData;
        aplicarFiltro();
        
        const tbody = document.getElementById('tabla-body');
        tbody.innerHTML = `<tr><td colspan="9" class="text-center p-4 bg-red-50 text-red-600 font-semibold border-b border-red-200">
            ⚠️ No se pudo conectar a MySQL en localhost:3000. Mostrando datos de demostración.<br>
            <span class="text-xs text-red-400 font-normal">Si estás viendo esto en el navegador web o vista previa, es normal. Debes ejecutar tu API Node localmente para ver datos reales.</span>
        </td></tr>` + tbody.innerHTML;
    }
}

function aplicarFiltro() {
    const fechaInicio = document.getElementById('filtro-inicio').value;
    const fechaFin = document.getElementById('filtro-fin').value;
    let dataFiltrada = allData;

    if (fechaInicio) dataFiltrada = dataFiltrada.filter(r => r.mes >= fechaInicio);
    if (fechaFin) dataFiltrada = dataFiltrada.filter(r => r.mes <= fechaFin);

    datosFiltradosActuales = dataFiltrada; // Guardar estado para usarlo en el cambio de gráfico

    renderTable(dataFiltrada);
    renderChart(dataFiltrada);
    renderCards(dataFiltrada);
    renderVisuals(dataFiltrada); 
}

// NUEVA FUNCIÓN: Actualiza la gráfica de tendencia respetando los filtros de fecha
function actualizarGraficoTendencia() {
    if (datosFiltradosActuales.length > 0) {
        renderChart(datosFiltradosActuales);
    } else if (allData.length > 0) {
        renderChart(allData); // Fallback si aún no se aplicó ningún filtro
    }
}

function limpiarFiltro() {
    document.getElementById('filtro-inicio').value = '';
    document.getElementById('filtro-fin').value = '';
    aplicarFiltro();
}

// 7. FUNCIONES DE RENDERIZADO (UI)
function toggleTabla() {
    const contenedor = document.getElementById('tabla-contenedor');
    const icono = document.getElementById('icono-tabla');
    const estado = document.getElementById('tabla-estado');
    
    contenedor.classList.toggle('hidden');
    icono.classList.toggle('rotate-180');
    estado.textContent = contenedor.classList.contains('hidden') ? 'Expandir' : 'Contraer';
}

function renderTable(data) {
    const format = (val) => (val * 100).toFixed(1) + '%';
    if (data.length === 0) {
        document.getElementById('tabla-body').innerHTML = `<tr><td colspan="9" class="text-center p-6 text-slate-500">No hay datos para el rango de fechas seleccionado.</td></tr>`;
        return;
    }

    document.getElementById('tabla-body').innerHTML = data.map(r => `
        <tr class="hover:bg-slate-50">
            <td class="px-4 py-2 font-semibold">${r.mes}</td>
            <td class="px-4 py-2">${r.equipo}</td>
            <td class="px-4 py-2">${format(r.disponibilidad)}</td>
            <td class="px-4 py-2">${format(r.eficiencia)}</td>
            <td class="px-4 py-2">${format(r.calidad)}</td>
            <td class="px-4 py-2 font-semibold text-amber-600">${format(r.utilizacion)}</td>
            <td class="px-4 py-2 font-bold text-green-600">${format(r.oee)}</td>
            <td class="px-4 py-2 font-bold text-blue-600">${format(r.teep)}</td>
            <td class="px-4 py-2">
                <button onclick="eliminar(${r.id})" class="text-red-500 hover:text-red-700 text-xs font-semibold">Eliminar</button>
            </td>
        </tr>
    `).join('');
}

function renderCards(data) {
    if(data.length === 0) {
        document.getElementById('kpi-cards').innerHTML = '<div class="col-span-full text-center text-slate-400 p-4">Sin datos para promediar</div>';
        return;
    }
    const promedios = data.reduce((acc, curr) => {
        acc.oee += curr.oee; acc.teep += curr.teep; acc.disp += curr.disponibilidad;
        acc.efic += curr.eficiencia; acc.cal += curr.calidad; acc.util += curr.utilizacion;
        return acc;
    }, {oee:0, teep:0, disp:0, efic:0, cal:0, util:0});

    const count = data.length;
    const cardsHtml = [
        { title: 'OEE Prom.', val: promedios.oee/count, color: 'text-green-600' },
        { title: 'TEEP Prom.', val: promedios.teep/count, color: 'text-blue-600' },
        { title: 'Disp. Prom.', val: promedios.disp/count, color: 'text-indigo-600' },
        { title: 'Efic. Prom.', val: promedios.efic/count, color: 'text-purple-600' },
        { title: 'Cal. Prom.', val: promedios.cal/count, color: 'text-rose-600' },
        { title: 'Util. Prom.', val: promedios.util/count, color: 'text-amber-600' }
    ].map(c => `
        <div class="bg-white rounded shadow p-4 text-center border border-slate-200">
            <div class="text-xs font-bold text-slate-500 uppercase">${c.title}</div>
            <div class="text-2xl font-black ${c.color}">${(c.val * 100).toFixed(1)}%</div>
        </div>
    `).join('');
    document.getElementById('kpi-cards').innerHTML = cardsHtml;
}

function renderChart(data) {
    const ctx = document.getElementById('tendenciaChart').getContext('2d');
    const labels = data.map(d => d.mes);
    
    const oeeData = data.map(d => (d.oee * 100).toFixed(1));
    const teepData = data.map(d => (d.teep * 100).toFixed(1));
    const dispData = data.map(d => (d.disponibilidad * 100).toFixed(1));
    const eficData = data.map(d => (d.eficiencia * 100).toFixed(1));
    const calData = data.map(d => (d.calidad * 100).toFixed(1));
    const utilData = data.map(d => (d.utilizacion * 100).toFixed(1));

    // Obtener preferencias del usuario desde los dropdowns
    const tipoGrafico = document.getElementById('tipoGrafico').value;
    const vistaMetricas = document.getElementById('vistaMetricas').value;

    // Determinar lógicamente qué métricas se van a mostrar u ocultar
    const showOEE = vistaMetricas === 'principales' || vistaMetricas === 'todos';
    const showTEEP = vistaMetricas === 'principales' || vistaMetricas === 'todos';
    const showFactores = vistaMetricas === 'factores' || vistaMetricas === 'todos';
    const showUtil = vistaMetricas === 'todos';

    if(chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: tipoGrafico,
        data: {
            labels: labels,
            datasets: [
                { label: 'OEE (%)', data: oeeData, borderColor: '#16a34a', backgroundColor: tipoGrafico === 'bar' ? '#16a34a' : 'rgba(22, 163, 74, 0.1)', borderWidth: tipoGrafico === 'bar' ? 0 : 2, fill: true, tension: 0.3, hidden: !showOEE },
                { label: 'TEEP (%)', data: teepData, borderColor: '#2563eb', backgroundColor: tipoGrafico === 'bar' ? '#2563eb' : 'rgba(37, 99, 235, 0.1)', borderWidth: tipoGrafico === 'bar' ? 0 : 2, fill: true, tension: 0.3, hidden: !showTEEP },
                { label: 'Disponibilidad (%)', data: dispData, borderColor: '#4f46e5', backgroundColor: '#4f46e5', borderWidth: tipoGrafico === 'bar' ? 0 : 2, borderDash: tipoGrafico === 'line' ? [5, 5] : [], fill: false, tension: 0.3, hidden: !showFactores },
                { label: 'Eficiencia (%)', data: eficData, borderColor: '#9333ea', backgroundColor: '#9333ea', borderWidth: tipoGrafico === 'bar' ? 0 : 2, borderDash: tipoGrafico === 'line' ? [5, 5] : [], fill: false, tension: 0.3, hidden: !showFactores },
                { label: 'Calidad (%)', data: calData, borderColor: '#e11d48', backgroundColor: '#e11d48', borderWidth: tipoGrafico === 'bar' ? 0 : 2, borderDash: tipoGrafico === 'line' ? [5, 5] : [], fill: false, tension: 0.3, hidden: !showFactores },
                { label: 'Utilización (%)', data: utilData, borderColor: '#d97706', backgroundColor: '#d97706', borderWidth: tipoGrafico === 'bar' ? 0 : 2, borderDash: tipoGrafico === 'line' ? [5, 5] : [], fill: false, tension: 0.3, hidden: !showUtil }
            ]
        },
        options: {
            responsive: true,
            scales: { y: { min: 0, max: 100 } },
            plugins: {
                legend: { labels: { usePointStyle: true, boxWidth: 10 } },
                datalabels: { display: false } // Ocultar datalabels en el gráfico de tendencia para no saturarlo
            }
        }
    });
}

// 8. RENDERIZAR RELOJ, BARRAS Y TERMÓMETROS
function renderVisuals(data) {
    if (data.length === 0) {
        if (relojInstance) relojInstance.destroy();
        if (barrasInstance) barrasInstance.destroy();
        if (barrasResultadosInstance) barrasResultadosInstance.destroy();
        document.getElementById('relojTexto').textContent = '0%';
        document.getElementById('termometros-container').innerHTML = '<div class="text-center text-slate-400">Sin datos</div>';
        return;
    }

    const promedios = data.reduce((acc, curr) => {
        acc.oee += curr.oee; acc.disp += curr.disponibilidad;
        acc.efic += curr.eficiencia; acc.cal += curr.calidad; 
        acc.teep += curr.teep; acc.util += curr.utilizacion;
        return acc;
    }, {oee:0, disp:0, efic:0, cal:0, teep:0, util:0});
    
    const count = data.length;
    const oeeAvg = (promedios.oee / count) * 100;
    const dispAvg = (promedios.disp / count) * 100;
    const eficAvg = (promedios.efic / count) * 100;
    const calAvg = (promedios.cal / count) * 100;
    const teepAvg = (promedios.teep / count) * 100;
    const utilAvg = (promedios.util / count) * 100;

    // --- 1. Gráfico de Reloj (Gauge OEE) ---
    const ctxReloj = document.getElementById('relojChart').getContext('2d');
    if (relojInstance) relojInstance.destroy();
    
    let colorOee = '#16a34a'; 
    if (oeeAvg < 65) colorOee = '#ef4444'; 
    else if (oeeAvg < 85) colorOee = '#f59e0b'; 
    
    document.getElementById('relojTexto').textContent = oeeAvg.toFixed(1) + '%';
    document.getElementById('relojTexto').style.color = colorOee;

    relojInstance = new Chart(ctxReloj, {
        type: 'doughnut',
        data: {
            labels: ['OEE Alcanzado', 'Pérdida'],
            datasets: [{
                data: [oeeAvg, 100 - oeeAvg],
                backgroundColor: [colorOee, '#e2e8f0'],
                borderWidth: 0,
                cutout: '75%'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, rotation: 270, circumference: 180,
            plugins: { tooltip: { enabled: false }, legend: { display: false }, datalabels: { display: false } }
        }
    });

    // Configuración compartida para las etiquetas de las barras (Centradas)
    const dataLabelsConfig = {
        anchor: 'center',
        align: 'center',
        color: '#ffffff', // Cambiado a blanco para mejor contraste dentro de la barra
        font: { weight: 'bold' },
        formatter: (val) => val.toFixed(1) + '%'
    };

    // --- 2. Gráfico de Barras 1: Factores (D, E, C) ---
    const ctxBarras = document.getElementById('barrasChart').getContext('2d');
    if (barrasInstance) barrasInstance.destroy();
    barrasInstance = new Chart(ctxBarras, {
        type: 'bar',
        data: {
            labels: ['Disp.', 'Efic.', 'Calidad'],
            datasets: [{
                data: [dispAvg, eficAvg, calAvg],
                backgroundColor: ['#4f46e5', '#9333ea', '#e11d48'],
                borderRadius: 6
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { min: 0, max: 100, display: false }, x: { grid: { display: false } } },
            plugins: { legend: { display: false }, datalabels: dataLabelsConfig }
        }
    });

    // --- 3. NUEVO: Gráfico de Barras 2: Resultados Globales (OEE, TEEP, Util) ---
    const ctxBarrasRes = document.getElementById('barrasResultadosChart').getContext('2d');
    if (barrasResultadosInstance) barrasResultadosInstance.destroy();
    barrasResultadosInstance = new Chart(ctxBarrasRes, {
        type: 'bar',
        data: {
            labels: ['OEE', 'TEEP', 'Util.'],
            datasets: [{
                data: [oeeAvg, teepAvg, utilAvg],
                backgroundColor: ['#16a34a', '#2563eb', '#d97706'],
                borderRadius: 6
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { min: 0, max: 100, display: false }, x: { grid: { display: false } } },
            plugins: { legend: { display: false }, datalabels: dataLabelsConfig }
        }
    });

    // --- 4. Termómetros Lineales ---
    const renderTermometro = (label, value, bgClass) => `
        <div>
            <div class="flex justify-between text-xs font-bold mb-1 text-slate-600">
                <span>${label}</span>
                <span>${value.toFixed(1)}%</span>
            </div>
            <div class="w-full bg-slate-200 rounded-full h-3 overflow-hidden shadow-inner border border-slate-300">
                <div class="${bgClass} h-full rounded-full transition-all duration-1000 ease-out" style="width: ${value}%"></div>
            </div>
        </div>
    `;

    document.getElementById('termometros-container').innerHTML = 
        renderTermometro('OEE', oeeAvg, colorOee === '#ef4444' ? 'bg-red-500' : colorOee === '#f59e0b' ? 'bg-amber-500' : 'bg-green-500') +
        renderTermometro('TEEP', teepAvg, 'bg-blue-500') +
        renderTermometro('Disponibilidad', dispAvg, 'bg-indigo-500');
}

// Inicializar
document.getElementById('mes').value = new Date().toISOString().slice(0,7);
actualizarTiempoTotal(); 
loadData().then(() => {
    verificarDuplicado(); 
});