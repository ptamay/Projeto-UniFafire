'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            if (res.ok) {
                router.push('/');
                router.refresh();
            } else {
                const data = await res.json();
                setIsLoading(false);
                setError('Usuário ou senha incorretos');
            }
        } catch (err) {
            setIsLoading(false);
            setError('Falha na conexão. Tente novamente.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-navy-900 px-4">

            <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-2xl mx-auto">

                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-navy-900 mb-2">Acesso ao Sistema</h1>
                    <p className="text-gray-500 font-medium text-sm">Insira suas credenciais para continuar</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">

                    {/* Error Message */}
                    {error && (
                        <div className="text-center p-3 rounded-xl bg-red-50 text-red-600 text-sm font-medium border border-red-100">
                            {error}
                        </div>
                    )}

                    {/* Username Input */}
                    <div className="space-y-2">
                        <label className="block text-navy-900 font-medium text-sm">
                            Usuário
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus-ring-navy transition-all"
                            placeholder="Digite seu usuário"
                            required
                            disabled={isLoading}
                        />
                    </div>

                    {/* Password Input */}
                    <div className="space-y-2">
                        <label className="block text-navy-900 font-medium text-sm">
                            Senha
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus-ring-navy transition-all"
                            placeholder="••••••••"
                            required
                            disabled={isLoading}
                        />
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-4 bg-gold text-navy-900 font-bold rounded-xl hover-bg-gold-hover hover-shadow-lg transform transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                        {isLoading ? (
                            <span className="flex items-center gap-2">
                                <svg className="animate-spin h-5 w-5 text-navy-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Entrando...
                            </span>
                        ) : (
                            "Entrar"
                        )}
                    </button>

                    <div className="mt-6 text-center">
                        <p className="text-sm text-gray-500">© {new Date().getFullYear()} Colégio São José</p>
                    </div>

                </form>
            </div>
        </div>
    );
}
