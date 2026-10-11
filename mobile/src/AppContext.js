import { createContext, useContext } from 'react';

// App-wide state: the polled server state, refresh, run (server call + toast), and who is using the phone.
export const AppContext = createContext(null);
export const useAppContext = () => useContext(AppContext);

// Height of the floating header (below the safe area).
export const HEADER_H = 52;

// Who is using this phone. Each teammate can pick a different person for the demo.
export const PEOPLE = [
  { id: 'senior', who: 'peggy', title: 'Peggy', sub: 'Older adult, lives alone', icon: 'house.fill' },
  { id: 'family', who: 'anne', title: 'Anne', sub: 'Daughter, primary contact. Approves rides', icon: 'person.fill' },
  { id: 'family', who: 'mark', title: 'Mark', sub: 'Son', icon: 'person.fill' },
  { id: 'family', who: 'dolores', title: 'Dolores', sub: 'Neighbor, next door', icon: 'person.fill' },
];
