//start/LoadMonitoring.ts
import { LoadMonitorService } from "#services/LoadMonitorService";

async function start() {
    if (process.argv.join('').includes('/ace')) return
     console.log('LoadMonitoring',{args:process.argv.join('')});
    const apiLoadMonitor = new LoadMonitorService('api');
    apiLoadMonitor.startMonitoring();
}

start();