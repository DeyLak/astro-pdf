import { detectBrowserPlatform, install, resolveBuildId, Browser, type InstallOptions } from '@puppeteer/browsers'
import { $, type ProcessPromise } from 'zx'

export async function installBrowser(options: Partial<InstallOptions>, defaultCacheDir: string) {
    const browser = options.browser ?? Browser.CHROME
    const buildId = options.buildId ?? await resolveBuildId(browser, detectBrowserPlatform(), 'stable')
    const installOptions: InstallOptions = {
        ...options,
        browser,
        buildId,
        cacheDir: options.cacheDir ?? defaultCacheDir
    }
    // cast to any to handle overloading of install (theres probably a better way to do this)
    const installed = await install(installOptions as any)
    return installed.executablePath
}

export type AstroPreviewResult = {
    url: URL,
    close: () => Promise<void>
}

export function astroPreview(options: { debug?: (message: string) => any, cwd?: string, timeout?: number } = {}): Promise<AstroPreviewResult | undefined> {
    const { debug, cwd, timeout } = options

    debug?.('starting astro preview server')
    const proc = $({ cwd })`npx astro preview`

    return new Promise(async (resolve) => {
        const tid = setTimeout(() => resolve(undefined), timeout ?? 5000)

        for await (const chunk of proc.stdout) {
            const text: string = chunk.toString('utf8')
    
            // look for server url
            const m = text.match(/https?:\/\/[\w\-.]+:\d+/)
            if (m) {
                try {
                    const url = new URL(m[0])
                    debug?.(`started astro preview server at ${url.href}`)
    
                    // function to end astro preview process
                    const close = async function () {
                        debug?.('closing astro preview server')
                        if (! await kill(proc, 'SIGTERM', 1000)) {
                            debug?.('killing server with SIGKILL')
                            await kill(proc, 'SIGKILL')
                        }
                        debug?.('successfully closed astro preview server')
                    }
    
                    clearTimeout(tid)
                    resolve({ url, close })
                } catch (e) {
                    debug?.(`failed to parse ${m[0]}. continuing to listen for server url`)
                }
            }
        }
    })
}

async function kill(proc: ProcessPromise, signal: NodeJS.Signals, timeout?: number) {
    return new Promise<boolean>((resolve, reject) => {
        const t = timeout !== undefined ? setTimeout(() => resolve(false), timeout) : -1
        proc.catch(p => {
            if(p.signal === signal) {
                clearTimeout(t)
                resolve(true)
            } else {
                clearTimeout(t)
                reject(p)
            }
        })
        proc.kill(signal)
    })
}