import { createContext, useContext } from 'react';

// App-wide state: the polled server state, refresh, run (server call + toast), the signed-in
// account (session, me, sign out…) and role ({ id: 'senior' | 'family', who: memberId, title: name }).
export const AppContext = createContext(null);
export const useAppContext = () => useContext(AppContext);

// Height of the floating header (below the safe area).
export const HEADER_H = 52;
