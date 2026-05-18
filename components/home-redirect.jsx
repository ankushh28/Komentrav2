'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function HomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (localStorage.getItem('token')) {
      router.replace('/dashboard');
    }
  }, [router]);

  return null;
}
