// Only the dedicated Pages preview build enables this flag.
export const TEST_BUILD=import.meta.env?.VITE_TEST_BUILD==='1';
export const storageKey=key=>(TEST_BUILD?'sector09-test-':'sector09-')+key;
