import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, MessageSquare } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const MessageLogs = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [directionFilter, setDirectionFilter] = useState("all");

  const { data: messageLogs, isLoading } = useQuery({
    queryKey: ['message-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('message_logs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    }
  });

  const filteredLogs = messageLogs?.filter(log => {
    const matchesSearch = log.phone?.includes(searchTerm) ||
                         log.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.message_type?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDirection = directionFilter === "all" || log.direction === directionFilter;
    
    return matchesSearch && matchesDirection;
  }) || [];

  const getDirectionColor = (direction: string) => {
    switch (direction) {
      case 'incoming': return 'bg-blue-100 text-blue-800';
      case 'outgoing': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getMessageTypeColor = (messageType: string) => {
    switch (messageType) {
      case 'text': return 'bg-gray-100 text-gray-800';
      case 'image': return 'bg-purple-100 text-purple-800';
      case 'document': return 'bg-orange-100 text-orange-800';
      case 'audio': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return <div className="p-6">Loading message logs...</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">Message Logs</h1>
        
        <div className="flex gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search messages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64"
            />
          </div>
          
          <Select value={directionFilter} onValueChange={setDirectionFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by direction" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Directions</SelectItem>
              <SelectItem value="incoming">Incoming</SelectItem>
              <SelectItem value="outgoing">Outgoing</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Message Logs ({filteredLogs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phone</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Content</TableHead>
                <TableHead>Metadata</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">{log.phone || 'N/A'}</TableCell>
                  <TableCell>
                    <Badge className={getDirectionColor(log.direction)}>
                      {log.direction || 'unknown'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={getMessageTypeColor(log.message_type)}>
                      {log.message_type || 'text'}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md truncate">
                    {log.content || 'No content'}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    {log.metadata ? (
                      <details className="cursor-pointer">
                        <summary className="text-sm text-muted-foreground">View metadata</summary>
                        <pre className="text-xs mt-1 p-2 bg-gray-50 rounded overflow-auto max-h-20">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-muted-foreground">No metadata</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
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

export default MessageLogs;