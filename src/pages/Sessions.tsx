import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Timer } from "lucide-react";

const Sessions = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .order('updated_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    }
  });

  const filteredSessions = sessions?.filter(session =>
    session.phone?.includes(searchTerm) ||
    session.intent?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    session.step?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getIntentColor = (intent: string) => {
    switch (intent) {
      case 'activity_log': return 'bg-blue-100 text-blue-800';
      case 'material_request': return 'bg-orange-100 text-orange-800';
      case 'booking': return 'bg-green-100 text-green-800';
      case 'query': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStepColor = (step: string) => {
    switch (step) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'pending': return 'bg-orange-100 text-orange-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return <div className="p-6">Loading sessions...</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">Active Sessions</h1>
        
        <div className="flex items-center gap-2 mb-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search sessions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Sessions ({filteredSessions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phone</TableHead>
                <TableHead>Intent</TableHead>
                <TableHead>Step</TableHead>
                <TableHead>Session Data</TableHead>
                <TableHead>Last Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSessions.map((session) => (
                <TableRow key={session.phone}>
                  <TableCell className="font-medium">{session.phone}</TableCell>
                  <TableCell>
                    <Badge className={getIntentColor(session.intent)}>
                      {session.intent || 'unknown'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={getStepColor(session.step)}>
                      {session.step || 'unknown'}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {session.data ? (
                      <details className="cursor-pointer">
                        <summary className="text-sm text-muted-foreground">View session data</summary>
                        <pre className="text-xs mt-1 p-2 bg-gray-50 rounded overflow-auto max-h-32">
                          {JSON.stringify(session.data, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-muted-foreground">No session data</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {session.updated_at ? new Date(session.updated_at).toLocaleString() : 'N/A'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Sessions;