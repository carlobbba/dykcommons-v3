import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { GlobalAdminHeader } from '@/components/GlobalAdminHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Trash2, Coins, Copy } from 'lucide-react';

interface League {
  id: string;
  name: string;
  join_code: string;
  created_at: string;
  created_by: string | null;
}

interface User {
  id: string;
  username: string;
  created_at: string;
}

interface LeagueMembership {
  league_id: string;
  league_name: string;
  join_code: string;
  token_balance: number;
  joined_at: string;
}

export function GlobalAdminPage() {
  const { user, isAdmin } = useAuth();
  const [leagues, setLeagues] = useState<(League & { member_count: number })[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userLeagues, setUserLeagues] = useState<LeagueMembership[]>([]);
  const [isLoadingUserDetail, setIsLoadingUserDetail] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;

    const { data: leaguesData } = await supabase
      .from('leagues')
      .select('*')
      .order('created_at', { ascending: false });

    const { data: membersData } = await supabase
      .from('league_members')
      .select('league_id');

    const countByLeague = new Map<string, number>();
    (membersData || []).forEach((m) => {
      countByLeague.set(m.league_id, (countByLeague.get(m.league_id) || 0) + 1);
    });

    setLeagues(
      (leaguesData || []).map((l) => ({
        ...l,
        member_count: countByLeague.get(l.id) || 0,
      }))
    );

    const { data: usersData } = await supabase
      .from('users')
      .select('id, username, created_at')
      .order('username');

    setUsers(usersData || []);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchUserLeagues = useCallback(async (userId: string) => {
    setIsLoadingUserDetail(true);
    const { data: members } = await supabase
      .from('league_members')
      .select('league_id, token_balance, joined_at')
      .eq('user_id', userId);

    if (!members || members.length === 0) {
      setUserLeagues([]);
      setIsLoadingUserDetail(false);
      return;
    }

    const leagueIds = [...new Set(members.map((m) => m.league_id))];
    const { data: leaguesData } = await supabase
      .from('leagues')
      .select('id, name, join_code')
      .in('id', leagueIds);

    const leagueMap = new Map(
      (leaguesData || []).map((l) => [l.id, { name: l.name, join_code: l.join_code }])
    );

    setUserLeagues(
      members.map((m) => ({
        league_id: m.league_id,
        league_name: leagueMap.get(m.league_id)?.name || 'Unknown',
        join_code: leagueMap.get(m.league_id)?.join_code || '',
        token_balance: m.token_balance,
        joined_at: m.joined_at,
      }))
    );
    setIsLoadingUserDetail(false);
  }, []);

  const handleUserClick = (u: User) => {
    setSelectedUser(u);
    fetchUserLeagues(u.id);
  };

  const handleDeleteLeague = async (leagueId: string) => {
    if (!user) return;
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-actions', {
        body: {
          admin_user_id: user.id,
          action: 'delete_league',
          payload: { league_id: leagueId },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('League deleted');
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete league');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!user) return;
    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-actions', {
        body: {
          admin_user_id: user.id,
          action: 'delete_user',
          payload: { user_id: userId },
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('User account deleted');
      setSelectedUser(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setIsDeleting(false);
    }
  };

  const copyJoinCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Join code copied!');
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <GlobalAdminHeader />
        <main className="container mx-auto px-4 py-8">
          <p className="text-center text-muted-foreground">Access denied. Admin only.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <GlobalAdminHeader />

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-8">Global Admin Dashboard</h1>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Leagues Section */}
          <div>
            <h2 className="text-lg font-semibold mb-4">All Leagues</h2>
            {isLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Members</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leagues.map((league) => (
                        <TableRow key={league.id}>
                          <TableCell className="font-medium">{league.name}</TableCell>
                          <TableCell>
                            <button
                              type="button"
                              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                              onClick={() => copyJoinCode(league.join_code)}
                            >
                              <Copy className="h-3 w-3" />
                              {league.join_code}
                            </button>
                          </TableCell>
                          <TableCell>{league.member_count}</TableCell>
                          <TableCell className="text-right">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={isDeleting}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Delete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete League?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete &quot;{league.name}&quot; and all its markets, members, and data.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteLeague(league.id)}
                                    className="bg-destructive text-destructive-foreground"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Users Section */}
          <div>
            <h2 className="text-lg font-semibold mb-4">All Users</h2>
            {isLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Username</TableHead>
                        <TableHead>Joined</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow
                          key={u.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => handleUserClick(u)}
                        >
                          <TableCell className="font-medium">{u.username}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {new Date(u.created_at).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* User Detail Sheet */}
      <Sheet open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{selectedUser?.username}</SheetTitle>
          </SheetHeader>
          {selectedUser && (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                User ID: {selectedUser.id}
              </p>
              <p className="text-sm text-muted-foreground">
                Registered: {new Date(selectedUser.created_at).toLocaleString()}
              </p>

              <div>
                <h3 className="font-medium mb-2">League Memberships</h3>
                {isLoadingUserDetail ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : userLeagues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not in any leagues</p>
                ) : (
                  <div className="space-y-3">
                    {userLeagues.map((lm) => (
                      <div
                        key={lm.league_id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div>
                          <p className="font-medium">{lm.league_name}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <button
                              type="button"
                              className="flex items-center gap-1 hover:text-foreground"
                              onClick={() => copyJoinCode(lm.join_code)}
                            >
                              <Copy className="h-3 w-3" />
                              {lm.join_code}
                            </button>
                            <span className="flex items-center gap-1">
                              <Coins className="h-3 w-3" />
                              {lm.token_balance} tokens
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Joined {new Date(lm.joined_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full" disabled={isDeleting}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete User Account?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete {selectedUser.username} and all their data across all leagues.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDeleteUser(selectedUser.id)}
                      className="bg-destructive text-destructive-foreground"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
