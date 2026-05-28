# State Management

This directory contains Zustand stores for managing application state.

## Structure

```
store/
├── auth/
│   └── authStore.ts
├── users/
│   └── userStore.ts
├── products/
│   └── productStore.ts
└── ...
```

## Creating a New Store

1. Create a new file for your store
2. Use Zustand to define your store
3. Export the store hook

## Example

```typescript
// userStore.ts
import { create } from 'zustand';
import { User } from '../../interfaces/User';
import { userService } from '../../services/api/users/userService';

interface UserState {
  users: User[];
  isLoading: boolean;
  error: string | null;
  fetchUsers: () => Promise<void>;
  // Add more actions as needed
}

export const useUserStore = create<UserState>((set) => ({
  users: [],
  isLoading: false,
  error: null,
  
  fetchUsers: async () => {
    set({ isLoading: true, error: null });
    try {
      const users = await userService.getUsers();
      set({ users, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to fetch users', 
        isLoading: false 
      });
    }
  },
  
  // Add more actions as needed
}));
```