'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function HomeAuthRedirect() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) router.replace('/dashboard');
  }, [router]);

  return null;
}
