//start/LoadMonitoring.ts
import { LoadMonitorService } from "#services/LoadMonitorService";

async function start() {
    // if (process.env.ENABLE_AUTO_SCALING === 'true') { // Rendre configurable
        const apiLoadMonitor = new LoadMonitorService('api');
        apiLoadMonitor.startMonitoring();
    // }
}

start();