import type { RouteName } from './routes';

export interface NavTab {
  path: string;
  name: RouteName;
  label: string;
}

/** The five main destinations, in the order both nav bars show them. */
export const navTabs: NavTab[] = [
  { path: '/', name: 'home', label: 'ホーム' },
  { path: '/search', name: 'search', label: '検索' },
  { path: '/compose', name: 'compose', label: '投稿' },
  { path: '/notifications', name: 'notifications', label: '通知' },
  { path: '/profile', name: 'profile', label: 'プロフィール' },
];

/** The tab a route belongs to, for the bars' highlight: the edit screen is part of the profile tab. */
export function tabOf(name: RouteName): RouteName {
  return name === 'profile-edit' ? 'profile' : name;
}
