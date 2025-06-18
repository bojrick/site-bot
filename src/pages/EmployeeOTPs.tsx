import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Key, Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const EmployeeOTPs = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: otps, isLoading } = useQuery({
    queryKey: ['employee-otps'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_otps')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    }
  });

  const deleteOTPMutation = useMutation({
    mutationFn: async (phone: string) => {
      const { error } = await supabase
        .from('employee_otps')
        .delete()
        .eq('phone', phone);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee-otps'] });
      toast({
        title: "Success",
        description: "OTP deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete OTP",
        variant: "destructive",
      });
    }
  });

  const filteredOTPs = otps?.filter(otp =>
    otp.phone?.includes(searchTerm)
  ) || [];

  const handleDelete = async (phone: string) => {
    if (window.confirm("Are you sure you want to delete this OTP?")) {
      deleteOTPMutation.mutate(phone);
    }
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  const getStatusColor = (expiresAt: string, attempts: number) => {
    if (isExpired(expiresAt)) return 'bg-red-100 text-red-800';
    if (attempts >= 3) return 'bg-orange-100 text-orange-800';
    return 'bg-green-100 text-green-800';
  };

  const getStatus = (expiresAt: string, attempts: number) => {
    if (isExpired(expiresAt)) return 'Expired';
    if (attempts >= 3) return 'Blocked';
    return 'Active';
  };

  if (isLoading) {
    return <div className="p-6">Loading employee OTPs...</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-4">Employee OTPs</h1>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-800">Admin Access Required</h3>
              <p className="text-sm text-yellow-700">
                This section contains sensitive authentication data. Only administrators should have access to OTP management.
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 mb-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by phone number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-64"
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active OTPs ({filteredOTPs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOTPs.map((otp) => (
                <TableRow key={otp.phone}>
                  <TableCell className="font-medium">{otp.phone}</TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(otp.expires_at, otp.attempts)}>
                      {getStatus(otp.expires_at, otp.attempts)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className={otp.attempts >= 3 ? 'text-red-600 font-semibold' : ''}>
                      {otp.attempts}/3
                    </span>
                  </TableCell>
                  <TableCell>
                    {otp.created_at ? new Date(otp.created_at).toLocaleString() : 'N/A'}
                  </TableCell>
                  <TableCell>
                    <span className={isExpired(otp.expires_at) ? 'text-red-600' : ''}>
                      {new Date(otp.expires_at).toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleDelete(otp.phone)}
                      disabled={deleteOTPMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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

export default EmployeeOTPs;