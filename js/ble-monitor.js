// BLE Monitor and Graphing Module
// Provides real-time monitoring and graphing of MCT data via BLE

class BLEMonitor {
    constructor() {
        this.device = null;
        this.server = null;
        this.services = {};
        this.characteristics = {};
        this.isConnected = false;
        this.isMonitoring = false;
        this.updateInterval = null;
        
        // Data storage for graphing
        this.dataPoints = {
            timestamp: [],
            Vb: [], Ib: [], Pb: [], Rb: [],
            Vo: [], Io: [], Po: [], Ro: [],
            Pr: [], Rr: [], To: [], Be: [],
            Db: [], Do: [], dT: [], dT_h: [], dT_a: [],
            Pa: [], Rh: [], Qr: [],
            task_count: [], update_time: [], update_time_avg: []
        };
        
        // Chart instances
        this.charts = {};
        
        // Configuration
        this.maxDataPoints = 100; // Maximum number of data points to keep
        this.updateRate = 100; // Update rate in milliseconds (10Hz)
        
        // Service and characteristic UUIDs
        this.SERVICE_UUIDS = {
            VAPE_SERVICE: '0420',
            CURRENT_TIME_SERVICE: '1805',
            MONITORING_SERVICE: '1806',
            TASK_SERVICE: '1807'
        };
        
        this.CHARACTERISTIC_UUIDS = {
            // Vape service characteristics
            alpha: '0001',
            Tset: '0002',
            Pset: '0003',
            tFset_s: '0004',
            buttons: '0005',
            Tescc: '0006',
            Tkmeter: '0007',
            omega: '0009',
            current_time: '2A2B',
            i: '000A',
            Pout: '000B',
            WARN: '000C',
            
            // Monitoring service characteristics
            Vb: '0010',
            Ib: '0011',
            Pb: '0012',
            Rb: '0013',
            Vo: '0014',
            Io: '0015',
            Po: '0016',
            Ro: '0017',
            Pr: '0018',
            Rr: '0019',
            To: '001A',
            Be: '001B',
            Db: '001C',
            Do: '001D',
            dT: '001E',
            dT_h: '001F',
            dT_a: '0020',
            Pa: '0021',
            Rh: '0022',
            Qr: '0023',
            
            // Task service characteristics
            task_count: '0030',
            task_stats: '0031',
            update_time: '0032',
            update_time_min: '0033',
            update_time_max: '0034',
            update_time_avg: '0035',
            update_time_sum: '0036',
            update_time_count: '0037'
        };
        
        this.init();
    }
    
    init() {
        this.createUI();
        this.setupEventListeners();
    }
    
    createUI() {
        // Create monitoring panel
        const monitoringPanel = document.createElement('div');
        monitoringPanel.id = 'ble-monitoring-panel';
        monitoringPanel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90vw;
            height: 80vh;
            background: rgba(0, 20, 0, 0.95);
            border: 2px solid var(--neon-green);
            border-radius: 10px;
            z-index: 1000;
            display: none;
            flex-direction: column;
            padding: 20px;
            box-shadow: var(--neon-green-intense);
        `;
        
        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            color: var(--neon-green);
            font-size: 18px;
            font-weight: bold;
        `;
        header.innerHTML = `
            <span>MCT BLE Monitoring</span>
            <button id="close-monitoring" style="background: none; border: 1px solid var(--neon-green); color: var(--neon-green); padding: 5px 10px; border-radius: 5px; cursor: pointer;">✕</button>
        `;
        
        // Connection status
        const statusBar = document.createElement('div');
        statusBar.id = 'ble-status';
        statusBar.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding: 10px;
            background: rgba(0, 40, 0, 0.3);
            border-radius: 5px;
            color: var(--neon-green);
        `;
        statusBar.innerHTML = `
            <span>Status: <span id="connection-status">Disconnected</span></span>
            <button id="connect-ble" style="background: none; border: 1px solid var(--neon-green); color: var(--neon-green); padding: 5px 15px; border-radius: 5px; cursor: pointer;">Connect</button>
        `;
        
        // Chart container
        const chartContainer = document.createElement('div');
        chartContainer.id = 'chart-container';
        chartContainer.style.cssText = `
            flex: 1;
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1fr 1fr;
            gap: 15px;
            overflow: hidden;
        `;
        
        // Create chart canvases
        const charts = [
            { id: 'power-chart', title: 'Power (W)', metrics: ['Pb', 'Po', 'Pr'] },
            { id: 'voltage-chart', title: 'Voltage (V)', metrics: ['Vb', 'Vo'] },
            { id: 'current-chart', title: 'Current (A)', metrics: ['Ib', 'Io'] },
            { id: 'temperature-chart', title: 'Temperature (°F)', metrics: ['To', 'Tescc'] }
        ];
        
        charts.forEach(chart => {
            const chartDiv = document.createElement('div');
            chartDiv.style.cssText = `
                background: rgba(0, 20, 0, 0.5);
                border: 1px solid var(--neon-green);
                border-radius: 5px;
                padding: 10px;
                display: flex;
                flex-direction: column;
            `;
            
            const title = document.createElement('div');
            title.style.cssText = `
                color: var(--neon-green);
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 10px;
                text-align: center;
            `;
            title.textContent = chart.title;
            
            const canvas = document.createElement('canvas');
            canvas.id = chart.id;
            canvas.style.cssText = `
                flex: 1;
                width: 100%;
                height: 100%;
            `;
            
            chartDiv.appendChild(title);
            chartDiv.appendChild(canvas);
            chartContainer.appendChild(chartDiv);
        });
        
        // Controls
        const controls = document.createElement('div');
        controls.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 15px;
            padding: 10px;
            background: rgba(0, 40, 0, 0.3);
            border-radius: 5px;
        `;
        controls.innerHTML = `
            <div style="color: var(--neon-green);">
                <span>Update Rate: </span>
                <select id="update-rate" style="background: rgba(0, 20, 0, 0.8); color: var(--neon-green); border: 1px solid var(--neon-green); padding: 2px 5px;">
                    <option value="50">20Hz</option>
                    <option value="100" selected>10Hz</option>
                    <option value="200">5Hz</option>
                    <option value="500">2Hz</option>
                </select>
            </div>
            <button id="start-monitoring" style="background: none; border: 1px solid var(--neon-green); color: var(--neon-green); padding: 5px 15px; border-radius: 5px; cursor: pointer;">Start Monitoring</button>
        `;
        
        monitoringPanel.appendChild(header);
        monitoringPanel.appendChild(statusBar);
        monitoringPanel.appendChild(chartContainer);
        monitoringPanel.appendChild(controls);
        
        document.body.appendChild(monitoringPanel);
    }
    
    setupEventListeners() {
        // Connect button
        document.getElementById('connect-ble').addEventListener('click', () => {
            this.connect();
        });
        
        // Start monitoring button
        document.getElementById('start-monitoring').addEventListener('click', () => {
            if (this.isMonitoring) {
                this.stopMonitoring();
            } else {
                this.startMonitoring();
            }
        });
        
        // Close button
        document.getElementById('close-monitoring').addEventListener('click', () => {
            this.hide();
        });
        
        // Update rate selector
        document.getElementById('update-rate').addEventListener('change', (e) => {
            this.updateRate = parseInt(e.target.value);
            if (this.isMonitoring) {
                this.stopMonitoring();
                this.startMonitoring();
            }
        });
    }
    
    show() {
        document.getElementById('ble-monitoring-panel').style.display = 'flex';
    }
    
    hide() {
        document.getElementById('ble-monitoring-panel').style.display = 'none';
    }
    
    async connect() {
        try {
            this.updateStatus('Connecting...');
            
            // Request BLE device
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'AVS MCT' },
                    { services: [this.SERVICE_UUIDS.VAPE_SERVICE] }
                ],
                optionalServices: [
                    this.SERVICE_UUIDS.CURRENT_TIME_SERVICE,
                    this.SERVICE_UUIDS.MONITORING_SERVICE,
                    this.SERVICE_UUIDS.TASK_SERVICE
                ]
            });
            
            // Connect to GATT server
            this.server = await this.device.gatt.connect();
            
            // Get services
            this.services = {
                vape: await this.server.getPrimaryService(this.SERVICE_UUIDS.VAPE_SERVICE),
                currentTime: await this.server.getPrimaryService(this.SERVICE_UUIDS.CURRENT_TIME_SERVICE),
                monitoring: await this.server.getPrimaryService(this.SERVICE_UUIDS.MONITORING_SERVICE),
                task: await this.server.getPrimaryService(this.SERVICE_UUIDS.TASK_SERVICE)
            };
            
            // Get characteristics
            await this.getCharacteristics();
            
            this.isConnected = true;
            this.updateStatus('Connected');
            
            // Enable notifications for monitoring characteristics
            await this.enableNotifications();
            
        } catch (error) {
            console.error('BLE connection failed:', error);
            this.updateStatus('Connection failed');
        }
    }
    
    async getCharacteristics() {
        try {
            // Get characteristics from each service
            for (const [serviceName, service] of Object.entries(this.services)) {
                const characteristics = await service.getCharacteristics();
                for (const characteristic of characteristics) {
                    const uuid = characteristic.uuid.replace(/-/g, '').toLowerCase();
                    this.characteristics[uuid] = characteristic;
                }
            }
        } catch (error) {
            console.error('Failed to get characteristics:', error);
        }
    }
    
    async enableNotifications() {
        try {
            // Enable notifications for monitoring characteristics
            const monitoringChars = [
                '0010', '0011', '0012', '0013', '0014', '0015', '0016', '0017',
                '0018', '0019', '001A', '001B', '001C', '001D', '001E', '001F',
                '0020', '0021', '0022', '0023'
            ];
            
            for (const charUuid of monitoringChars) {
                const characteristic = this.characteristics[charUuid];
                if (characteristic && characteristic.properties.notify) {
                    await characteristic.startNotifications();
                    characteristic.addEventListener('characteristicvaluechanged', (event) => {
                        this.handleCharacteristicValueChanged(charUuid, event.target.value);
                    });
                }
            }
        } catch (error) {
            console.error('Failed to enable notifications:', error);
        }
    }
    
    handleCharacteristicValueChanged(uuid, value) {
        try {
            const dataView = new DataView(value.buffer);
            const floatValue = dataView.getFloat32(0, true); // little-endian
            
            // Map UUID to metric name
            const metricMap = {
                '0010': 'Vb', '0011': 'Ib', '0012': 'Pb', '0013': 'Rb',
                '0014': 'Vo', '0015': 'Io', '0016': 'Po', '0017': 'Ro',
                '0018': 'Pr', '0019': 'Rr', '001A': 'To', '001B': 'Be',
                '001C': 'Db', '001D': 'Do', '001E': 'dT', '001F': 'dT_h',
                '0020': 'dT_a', '0021': 'Pa', '0022': 'Rh', '0023': 'Qr'
            };
            
            const metricName = metricMap[uuid];
            if (metricName) {
                this.addDataPoint(metricName, floatValue);
            }
        } catch (error) {
            console.error('Error handling characteristic value:', error);
        }
    }
    
    addDataPoint(metric, value) {
        const timestamp = Date.now();
        
        // Add to data points
        if (!this.dataPoints[metric]) {
            this.dataPoints[metric] = [];
        }
        
        this.dataPoints[metric].push({ timestamp, value });
        
        // Limit data points
        if (this.dataPoints[metric].length > this.maxDataPoints) {
            this.dataPoints[metric].shift();
        }
        
        // Update charts
        this.updateCharts();
    }
    
    updateCharts() {
        // Update each chart
        Object.keys(this.charts).forEach(chartId => {
            const chart = this.charts[chartId];
            if (chart && chart.update) {
                chart.update();
            }
        });
    }
    
    startMonitoring() {
        if (!this.isConnected) {
            alert('Please connect to BLE device first');
            return;
        }
        
        this.isMonitoring = true;
        document.getElementById('start-monitoring').textContent = 'Stop Monitoring';
        document.getElementById('start-monitoring').style.borderColor = 'var(--neon-red)';
        document.getElementById('start-monitoring').style.color = 'var(--neon-red)';
        
        // Start periodic updates
        this.updateInterval = setInterval(() => {
            this.readAllCharacteristics();
        }, this.updateRate);
        
        // Initialize charts
        this.initializeCharts();
    }
    
    stopMonitoring() {
        this.isMonitoring = false;
        document.getElementById('start-monitoring').textContent = 'Start Monitoring';
        document.getElementById('start-monitoring').style.borderColor = 'var(--neon-green)';
        document.getElementById('start-monitoring').style.color = 'var(--neon-green)';
        
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
    
    async readAllCharacteristics() {
        if (!this.isConnected) return;
        
        try {
            // Read all monitoring characteristics
            const monitoringChars = [
                '0010', '0011', '0012', '0013', '0014', '0015', '0016', '0017',
                '0018', '0019', '001A', '001B', '001C', '001D', '001E', '001F',
                '0020', '0021', '0022', '0023'
            ];
            
            for (const charUuid of monitoringChars) {
                const characteristic = this.characteristics[charUuid];
                if (characteristic && characteristic.properties.read) {
                    try {
                        const value = await characteristic.readValue();
                        this.handleCharacteristicValueChanged(charUuid, value);
                    } catch (error) {
                        console.error(`Failed to read characteristic ${charUuid}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Error reading characteristics:', error);
        }
    }
    
    initializeCharts() {
        // Initialize Chart.js charts
        const chartConfigs = [
            {
                id: 'power-chart',
                title: 'Power (W)',
                metrics: ['Pb', 'Po', 'Pr'],
                colors: ['#00ff00', '#ff0000', '#0000ff']
            },
            {
                id: 'voltage-chart',
                title: 'Voltage (V)',
                metrics: ['Vb', 'Vo'],
                colors: ['#00ff00', '#ff0000']
            },
            {
                id: 'current-chart',
                title: 'Current (A)',
                metrics: ['Ib', 'Io'],
                colors: ['#00ff00', '#ff0000']
            },
            {
                id: 'temperature-chart',
                title: 'Temperature (°F)',
                metrics: ['To', 'Tescc'],
                colors: ['#00ff00', '#ff0000']
            }
        ];
        
        chartConfigs.forEach(config => {
            const canvas = document.getElementById(config.id);
            if (canvas) {
                this.charts[config.id] = this.createChart(canvas, config);
            }
        });
    }
    
    createChart(canvas, config) {
        const ctx = canvas.getContext('2d');
        
        const datasets = config.metrics.map((metric, index) => ({
            label: metric,
            data: [],
            borderColor: config.colors[index],
            backgroundColor: config.colors[index] + '20',
            borderWidth: 2,
            fill: false,
            tension: 0.4
        }));
        
        const chart = new window.Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#00ff00',
                            font: {
                                size: 12
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: config.title,
                        color: '#00ff00',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#00ff00',
                            font: {
                                size: 10
                            }
                        },
                        grid: {
                            color: 'rgba(0, 255, 0, 0.1)'
                        }
                    },
                    y: {
                        ticks: {
                            color: '#00ff00',
                            font: {
                                size: 10
                            }
                        },
                        grid: {
                            color: 'rgba(0, 255, 0, 0.1)'
                        }
                    }
                },
                animation: {
                    duration: 0
                }
            }
        });
        
        // Add update method
        chart.update = () => {
            const timestamps = [];
            const dataByMetric = {};
            
            // Collect all timestamps and data
            config.metrics.forEach(metric => {
                if (this.dataPoints[metric]) {
                    this.dataPoints[metric].forEach(point => {
                        if (!timestamps.includes(point.timestamp)) {
                            timestamps.push(point.timestamp);
                        }
                        if (!dataByMetric[metric]) {
                            dataByMetric[metric] = {};
                        }
                        dataByMetric[metric][point.timestamp] = point.value;
                    });
                }
            });
            
            // Sort timestamps
            timestamps.sort((a, b) => a - b);
            
            // Update chart data
            chart.data.labels = timestamps.map(t => new Date(t).toLocaleTimeString());
            
            config.metrics.forEach((metric, index) => {
                const data = timestamps.map(t => dataByMetric[metric]?.[t] || null);
                chart.data.datasets[index].data = data;
            });
            
            chart.update('none');
        };
        
        return chart;
    }
    
    updateStatus(status) {
        document.getElementById('connection-status').textContent = status;
    }
    
    disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.isConnected = false;
        this.updateStatus('Disconnected');
    }
}

// Export for use in main application
export { BLEMonitor }; 
// Provides real-time monitoring and graphing of MCT data via BLE

class BLEMonitor {
    constructor() {
        this.device = null;
        this.server = null;
        this.services = {};
        this.characteristics = {};
        this.isConnected = false;
        this.isMonitoring = false;
        this.updateInterval = null;
        
        // Data storage for graphing
        this.dataPoints = {
            timestamp: [],
            Vb: [], Ib: [], Pb: [], Rb: [],
            Vo: [], Io: [], Po: [], Ro: [],
            Pr: [], Rr: [], To: [], Be: [],
            Db: [], Do: [], dT: [], dT_h: [], dT_a: [],
            Pa: [], Rh: [], Qr: [],
            task_count: [], update_time: [], update_time_avg: []
        };
        
        // Chart instances
        this.charts = {};
        
        // Configuration
        this.maxDataPoints = 100; // Maximum number of data points to keep
        this.updateRate = 100; // Update rate in milliseconds (10Hz)
        
        // Service and characteristic UUIDs
        this.SERVICE_UUIDS = {
            VAPE_SERVICE: '0420',
            CURRENT_TIME_SERVICE: '1805',
            MONITORING_SERVICE: '1806',
            TASK_SERVICE: '1807'
        };
        
        this.CHARACTERISTIC_UUIDS = {
            // Vape service characteristics
            alpha: '0001',
            Tset: '0002',
            Pset: '0003',
            tFset_s: '0004',
            buttons: '0005',
            Tescc: '0006',
            Tkmeter: '0007',
            omega: '0009',
            current_time: '2A2B',
            i: '000A',
            Pout: '000B',
            WARN: '000C',
            
            // Monitoring service characteristics
            Vb: '0010',
            Ib: '0011',
            Pb: '0012',
            Rb: '0013',
            Vo: '0014',
            Io: '0015',
            Po: '0016',
            Ro: '0017',
            Pr: '0018',
            Rr: '0019',
            To: '001A',
            Be: '001B',
            Db: '001C',
            Do: '001D',
            dT: '001E',
            dT_h: '001F',
            dT_a: '0020',
            Pa: '0021',
            Rh: '0022',
            Qr: '0023',
            
            // Task service characteristics
            task_count: '0030',
            task_stats: '0031',
            update_time: '0032',
            update_time_min: '0033',
            update_time_max: '0034',
            update_time_avg: '0035',
            update_time_sum: '0036',
            update_time_count: '0037'
        };
        
        this.init();
    }
    
    init() {
        this.createUI();
        this.setupEventListeners();
    }
    
    createUI() {
        // Create monitoring panel
        const monitoringPanel = document.createElement('div');
        monitoringPanel.id = 'ble-monitoring-panel';
        monitoringPanel.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90vw;
            height: 80vh;
            background: rgba(0, 20, 0, 0.95);
            border: 2px solid var(--neon-green);
            border-radius: 10px;
            z-index: 1000;
            display: none;
            flex-direction: column;
            padding: 20px;
            box-shadow: var(--neon-green-intense);
        `;
        
        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            color: var(--neon-green);
            font-size: 18px;
            font-weight: bold;
        `;
        header.innerHTML = `
            <span>MCT BLE Monitoring</span>
            <button id="close-monitoring" style="background: none; border: 1px solid var(--neon-green); color: var(--neon-green); padding: 5px 10px; border-radius: 5px; cursor: pointer;">✕</button>
        `;
        
        // Connection status
        const statusBar = document.createElement('div');
        statusBar.id = 'ble-status';
        statusBar.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding: 10px;
            background: rgba(0, 40, 0, 0.3);
            border-radius: 5px;
            color: var(--neon-green);
        `;
        statusBar.innerHTML = `
            <span>Status: <span id="connection-status">Disconnected</span></span>
            <button id="connect-ble" style="background: none; border: 1px solid var(--neon-green); color: var(--neon-green); padding: 5px 15px; border-radius: 5px; cursor: pointer;">Connect</button>
        `;
        
        // Chart container
        const chartContainer = document.createElement('div');
        chartContainer.id = 'chart-container';
        chartContainer.style.cssText = `
            flex: 1;
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: 1fr 1fr;
            gap: 15px;
            overflow: hidden;
        `;
        
        // Create chart canvases
        const charts = [
            { id: 'power-chart', title: 'Power (W)', metrics: ['Pb', 'Po', 'Pr'] },
            { id: 'voltage-chart', title: 'Voltage (V)', metrics: ['Vb', 'Vo'] },
            { id: 'current-chart', title: 'Current (A)', metrics: ['Ib', 'Io'] },
            { id: 'temperature-chart', title: 'Temperature (°F)', metrics: ['To', 'Tescc'] }
        ];
        
        charts.forEach(chart => {
            const chartDiv = document.createElement('div');
            chartDiv.style.cssText = `
                background: rgba(0, 20, 0, 0.5);
                border: 1px solid var(--neon-green);
                border-radius: 5px;
                padding: 10px;
                display: flex;
                flex-direction: column;
            `;
            
            const title = document.createElement('div');
            title.style.cssText = `
                color: var(--neon-green);
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 10px;
                text-align: center;
            `;
            title.textContent = chart.title;
            
            const canvas = document.createElement('canvas');
            canvas.id = chart.id;
            canvas.style.cssText = `
                flex: 1;
                width: 100%;
                height: 100%;
            `;
            
            chartDiv.appendChild(title);
            chartDiv.appendChild(canvas);
            chartContainer.appendChild(chartDiv);
        });
        
        // Controls
        const controls = document.createElement('div');
        controls.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 15px;
            padding: 10px;
            background: rgba(0, 40, 0, 0.3);
            border-radius: 5px;
        `;
        controls.innerHTML = `
            <div style="color: var(--neon-green);">
                <span>Update Rate: </span>
                <select id="update-rate" style="background: rgba(0, 20, 0, 0.8); color: var(--neon-green); border: 1px solid var(--neon-green); padding: 2px 5px;">
                    <option value="50">20Hz</option>
                    <option value="100" selected>10Hz</option>
                    <option value="200">5Hz</option>
                    <option value="500">2Hz</option>
                </select>
            </div>
            <button id="start-monitoring" style="background: none; border: 1px solid var(--neon-green); color: var(--neon-green); padding: 5px 15px; border-radius: 5px; cursor: pointer;">Start Monitoring</button>
        `;
        
        monitoringPanel.appendChild(header);
        monitoringPanel.appendChild(statusBar);
        monitoringPanel.appendChild(chartContainer);
        monitoringPanel.appendChild(controls);
        
        document.body.appendChild(monitoringPanel);
    }
    
    setupEventListeners() {
        // Connect button
        document.getElementById('connect-ble').addEventListener('click', () => {
            this.connect();
        });
        
        // Start monitoring button
        document.getElementById('start-monitoring').addEventListener('click', () => {
            if (this.isMonitoring) {
                this.stopMonitoring();
            } else {
                this.startMonitoring();
            }
        });
        
        // Close button
        document.getElementById('close-monitoring').addEventListener('click', () => {
            this.hide();
        });
        
        // Update rate selector
        document.getElementById('update-rate').addEventListener('change', (e) => {
            this.updateRate = parseInt(e.target.value);
            if (this.isMonitoring) {
                this.stopMonitoring();
                this.startMonitoring();
            }
        });
    }
    
    show() {
        document.getElementById('ble-monitoring-panel').style.display = 'flex';
    }
    
    hide() {
        document.getElementById('ble-monitoring-panel').style.display = 'none';
    }
    
    async connect() {
        try {
            this.updateStatus('Connecting...');
            
            // Request BLE device
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'AVS MCT' },
                    { services: [this.SERVICE_UUIDS.VAPE_SERVICE] }
                ],
                optionalServices: [
                    this.SERVICE_UUIDS.CURRENT_TIME_SERVICE,
                    this.SERVICE_UUIDS.MONITORING_SERVICE,
                    this.SERVICE_UUIDS.TASK_SERVICE
                ]
            });
            
            // Connect to GATT server
            this.server = await this.device.gatt.connect();
            
            // Get services
            this.services = {
                vape: await this.server.getPrimaryService(this.SERVICE_UUIDS.VAPE_SERVICE),
                currentTime: await this.server.getPrimaryService(this.SERVICE_UUIDS.CURRENT_TIME_SERVICE),
                monitoring: await this.server.getPrimaryService(this.SERVICE_UUIDS.MONITORING_SERVICE),
                task: await this.server.getPrimaryService(this.SERVICE_UUIDS.TASK_SERVICE)
            };
            
            // Get characteristics
            await this.getCharacteristics();
            
            this.isConnected = true;
            this.updateStatus('Connected');
            
            // Enable notifications for monitoring characteristics
            await this.enableNotifications();
            
        } catch (error) {
            console.error('BLE connection failed:', error);
            this.updateStatus('Connection failed');
        }
    }
    
    async getCharacteristics() {
        try {
            // Get characteristics from each service
            for (const [serviceName, service] of Object.entries(this.services)) {
                const characteristics = await service.getCharacteristics();
                for (const characteristic of characteristics) {
                    const uuid = characteristic.uuid.replace(/-/g, '').toLowerCase();
                    this.characteristics[uuid] = characteristic;
                }
            }
        } catch (error) {
            console.error('Failed to get characteristics:', error);
        }
    }
    
    async enableNotifications() {
        try {
            // Enable notifications for monitoring characteristics
            const monitoringChars = [
                '0010', '0011', '0012', '0013', '0014', '0015', '0016', '0017',
                '0018', '0019', '001A', '001B', '001C', '001D', '001E', '001F',
                '0020', '0021', '0022', '0023'
            ];
            
            for (const charUuid of monitoringChars) {
                const characteristic = this.characteristics[charUuid];
                if (characteristic && characteristic.properties.notify) {
                    await characteristic.startNotifications();
                    characteristic.addEventListener('characteristicvaluechanged', (event) => {
                        this.handleCharacteristicValueChanged(charUuid, event.target.value);
                    });
                }
            }
        } catch (error) {
            console.error('Failed to enable notifications:', error);
        }
    }
    
    handleCharacteristicValueChanged(uuid, value) {
        try {
            const dataView = new DataView(value.buffer);
            const floatValue = dataView.getFloat32(0, true); // little-endian
            
            // Map UUID to metric name
            const metricMap = {
                '0010': 'Vb', '0011': 'Ib', '0012': 'Pb', '0013': 'Rb',
                '0014': 'Vo', '0015': 'Io', '0016': 'Po', '0017': 'Ro',
                '0018': 'Pr', '0019': 'Rr', '001A': 'To', '001B': 'Be',
                '001C': 'Db', '001D': 'Do', '001E': 'dT', '001F': 'dT_h',
                '0020': 'dT_a', '0021': 'Pa', '0022': 'Rh', '0023': 'Qr'
            };
            
            const metricName = metricMap[uuid];
            if (metricName) {
                this.addDataPoint(metricName, floatValue);
            }
        } catch (error) {
            console.error('Error handling characteristic value:', error);
        }
    }
    
    addDataPoint(metric, value) {
        const timestamp = Date.now();
        
        // Add to data points
        if (!this.dataPoints[metric]) {
            this.dataPoints[metric] = [];
        }
        
        this.dataPoints[metric].push({ timestamp, value });
        
        // Limit data points
        if (this.dataPoints[metric].length > this.maxDataPoints) {
            this.dataPoints[metric].shift();
        }
        
        // Update charts
        this.updateCharts();
    }
    
    updateCharts() {
        // Update each chart
        Object.keys(this.charts).forEach(chartId => {
            const chart = this.charts[chartId];
            if (chart && chart.update) {
                chart.update();
            }
        });
    }
    
    startMonitoring() {
        if (!this.isConnected) {
            alert('Please connect to BLE device first');
            return;
        }
        
        this.isMonitoring = true;
        document.getElementById('start-monitoring').textContent = 'Stop Monitoring';
        document.getElementById('start-monitoring').style.borderColor = 'var(--neon-red)';
        document.getElementById('start-monitoring').style.color = 'var(--neon-red)';
        
        // Start periodic updates
        this.updateInterval = setInterval(() => {
            this.readAllCharacteristics();
        }, this.updateRate);
        
        // Initialize charts
        this.initializeCharts();
    }
    
    stopMonitoring() {
        this.isMonitoring = false;
        document.getElementById('start-monitoring').textContent = 'Start Monitoring';
        document.getElementById('start-monitoring').style.borderColor = 'var(--neon-green)';
        document.getElementById('start-monitoring').style.color = 'var(--neon-green)';
        
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
    
    async readAllCharacteristics() {
        if (!this.isConnected) return;
        
        try {
            // Read all monitoring characteristics
            const monitoringChars = [
                '0010', '0011', '0012', '0013', '0014', '0015', '0016', '0017',
                '0018', '0019', '001A', '001B', '001C', '001D', '001E', '001F',
                '0020', '0021', '0022', '0023'
            ];
            
            for (const charUuid of monitoringChars) {
                const characteristic = this.characteristics[charUuid];
                if (characteristic && characteristic.properties.read) {
                    try {
                        const value = await characteristic.readValue();
                        this.handleCharacteristicValueChanged(charUuid, value);
                    } catch (error) {
                        console.error(`Failed to read characteristic ${charUuid}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Error reading characteristics:', error);
        }
    }
    
    initializeCharts() {
        // Initialize Chart.js charts
        const chartConfigs = [
            {
                id: 'power-chart',
                title: 'Power (W)',
                metrics: ['Pb', 'Po', 'Pr'],
                colors: ['#00ff00', '#ff0000', '#0000ff']
            },
            {
                id: 'voltage-chart',
                title: 'Voltage (V)',
                metrics: ['Vb', 'Vo'],
                colors: ['#00ff00', '#ff0000']
            },
            {
                id: 'current-chart',
                title: 'Current (A)',
                metrics: ['Ib', 'Io'],
                colors: ['#00ff00', '#ff0000']
            },
            {
                id: 'temperature-chart',
                title: 'Temperature (°F)',
                metrics: ['To', 'Tescc'],
                colors: ['#00ff00', '#ff0000']
            }
        ];
        
        chartConfigs.forEach(config => {
            const canvas = document.getElementById(config.id);
            if (canvas) {
                this.charts[config.id] = this.createChart(canvas, config);
            }
        });
    }
    
    createChart(canvas, config) {
        const ctx = canvas.getContext('2d');
        
        const datasets = config.metrics.map((metric, index) => ({
            label: metric,
            data: [],
            borderColor: config.colors[index],
            backgroundColor: config.colors[index] + '20',
            borderWidth: 2,
            fill: false,
            tension: 0.4
        }));
        
        const chart = new window.Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: '#00ff00',
                            font: {
                                size: 12
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: config.title,
                        color: '#00ff00',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: '#00ff00',
                            font: {
                                size: 10
                            }
                        },
                        grid: {
                            color: 'rgba(0, 255, 0, 0.1)'
                        }
                    },
                    y: {
                        ticks: {
                            color: '#00ff00',
                            font: {
                                size: 10
                            }
                        },
                        grid: {
                            color: 'rgba(0, 255, 0, 0.1)'
                        }
                    }
                },
                animation: {
                    duration: 0
                }
            }
        });
        
        // Add update method
        chart.update = () => {
            const timestamps = [];
            const dataByMetric = {};
            
            // Collect all timestamps and data
            config.metrics.forEach(metric => {
                if (this.dataPoints[metric]) {
                    this.dataPoints[metric].forEach(point => {
                        if (!timestamps.includes(point.timestamp)) {
                            timestamps.push(point.timestamp);
                        }
                        if (!dataByMetric[metric]) {
                            dataByMetric[metric] = {};
                        }
                        dataByMetric[metric][point.timestamp] = point.value;
                    });
                }
            });
            
            // Sort timestamps
            timestamps.sort((a, b) => a - b);
            
            // Update chart data
            chart.data.labels = timestamps.map(t => new Date(t).toLocaleTimeString());
            
            config.metrics.forEach((metric, index) => {
                const data = timestamps.map(t => dataByMetric[metric]?.[t] || null);
                chart.data.datasets[index].data = data;
            });
            
            chart.update('none');
        };
        
        return chart;
    }
    
    updateStatus(status) {
        document.getElementById('connection-status').textContent = status;
    }
    
    disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.isConnected = false;
        this.updateStatus('Disconnected');
    }
}

// Export for use in main application
export { BLEMonitor }; 