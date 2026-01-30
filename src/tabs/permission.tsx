import React, { useEffect, useState } from "react"
import { db } from "~lib/db"
import { ShieldAlert, Globe, Check, X, ShieldCheck } from "lucide-react"

import "~style.css"

const PermissionTab = () => {
    const [scriptId, setScriptId] = useState<string | null>(null)
    const [domain, setDomain] = useState<string | null>(null)
    const [scriptName, setScriptName] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search)
        const sid = urlParams.get("scriptId")
        const dom = urlParams.get("domain")

        if (sid && dom) {
            setScriptId(sid)
            setDomain(dom)
            db.scripts.get(sid).then(s => {
                if (s) setScriptName(s.metadata.name)
            })
        } else {
            setError("Missing parameters. Cannot request permission.")
        }
    }, [])

    const handleAllow = async () => {
        if (!scriptId || !domain) return
        setSubmitting(true)
        try {
            await db.permissions.put({
                scriptId,
                domain,
                allow: true
            })
            window.close()
        } catch (e: any) {
            setError("Failed to save permission: " + e.message)
            setSubmitting(false)
        }
    }

    const handleDeny = () => {
        window.close()
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-white p-4 font-sans">
                <div className="bg-zinc-900 p-8 rounded-xl border border-red-900/50 max-w-md w-full text-center">
                    <ShieldAlert size={48} className="text-red-500 mx-auto mb-4" />
                    <h1 className="text-xl font-bold mb-2">Error</h1>
                    <p className="text-zinc-400">{error}</p>
                    <button onClick={() => window.close()} className="mt-6 px-6 py-2 bg-zinc-800 rounded hover:bg-zinc-700 transition-colors">Close</button>
                </div>
            </div>
        )
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-white p-4 font-sans">
            <div className="bg-zinc-900 p-8 rounded-xl border border-zinc-800 shadow-2xl max-w-lg w-full">
                <div className="flex items-center gap-3 mb-6">
                    <div className="bg-sky-500/10 p-3 rounded-full">
                        <Globe className="text-sky-400" size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Cross-Origin Request Access</h1>
                        <p className="text-zinc-500 text-sm">Security Verification</p>
                    </div>
                </div>

                <div className="bg-zinc-800/50 p-6 rounded-lg mb-8 border border-zinc-700/50">
                    <p className="text-zinc-300 mb-4 leading-relaxed">
                        The script <span className="text-emerald-400 font-semibold">"{scriptName || 'Unknown Script'}"</span> is attempting to access data from:
                    </p>
                    <div className="bg-zinc-950 px-4 py-3 rounded font-mono text-sky-400 break-all border border-sky-900/30">
                        {domain}
                    </div>
                </div>

                <div className="flex flex-col gap-4 mb-8">
                    <div className="flex items-start gap-3">
                        <ShieldCheck className="text-zinc-500 mt-1 shrink-0" size={18} />
                        <p className="text-sm text-zinc-400">
                            Granting this permission will allow the script to make network requests to this domain. Only allow if you trust the script.
                        </p>
                    </div>
                </div>

                <div className="flex gap-4">
                    <button 
                        onClick={handleDeny}
                        disabled={submitting}
                        className="flex-1 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 border border-zinc-700"
                    >
                        <X size={18} /> Deny
                    </button>
                    <button 
                        onClick={handleAllow}
                        disabled={submitting}
                        className="flex-1 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
                    >
                        {submitting ? "Saving..." : <><Check size={18} /> Allow Always</>}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default PermissionTab
