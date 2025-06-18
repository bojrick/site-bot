import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CustomerInquiry {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  occupation: string;
  office_space_requirement: string;
  office_space_use: string;
  expected_price_range: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

const CustomerInquiries = () => {
  const [inquiries, setInquiries] = useState<CustomerInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editingInquiry, setEditingInquiry] = useState<CustomerInquiry | null>(null);
  const [viewingInquiry, setViewingInquiry] = useState<CustomerInquiry | null>(null);
  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    email: "",
    occupation: "",
    office_space_requirement: "",
    office_space_use: "",
    expected_price_range: "",
    status: "inquiry",
    notes: ""
  });

  const fetchInquiries = async () => {
    try {
      const { data, error } = await supabase
        .from("customer_inquiries")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInquiries(data || []);
    } catch (error) {
      console.error("Error fetching inquiries:", error);
      toast({
        title: "Error",
        description: "Failed to fetch customer inquiries",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInquiries();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingInquiry) {
        const { error } = await supabase
          .from("customer_inquiries")
          .update(formData)
          .eq("id", editingInquiry.id);
        
        if (error) throw error;
        toast({ title: "Success", description: "Inquiry updated successfully" });
      } else {
        const { error } = await supabase
          .from("customer_inquiries")
          .insert([formData]);
        
        if (error) throw error;
        toast({ title: "Success", description: "Inquiry added successfully" });
      }
      
      setDialogOpen(false);
      setEditingInquiry(null);
      setFormData({
        full_name: "",
        phone: "",
        email: "",
        occupation: "",
        office_space_requirement: "",
        office_space_use: "",
        expected_price_range: "",
        status: "inquiry",
        notes: ""
      });
      fetchInquiries();
    } catch (error) {
      console.error("Error saving inquiry:", error);
      toast({
        title: "Error",
        description: "Failed to save inquiry",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (inquiry: CustomerInquiry) => {
    setEditingInquiry(inquiry);
    setFormData({
      full_name: inquiry.full_name || "",
      phone: inquiry.phone || "",
      email: inquiry.email || "",
      occupation: inquiry.occupation || "",
      office_space_requirement: inquiry.office_space_requirement || "",
      office_space_use: inquiry.office_space_use || "",
      expected_price_range: inquiry.expected_price_range || "",
      status: inquiry.status || "inquiry",
      notes: inquiry.notes || ""
    });
    setDialogOpen(true);
  };

  const handleView = (inquiry: CustomerInquiry) => {
    setViewingInquiry(inquiry);
    setViewDialogOpen(true);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "inquiry": return "secondary";
      case "site_visit_booked": return "default";
      case "converted": return "default";
      case "closed": return "outline";
      default: return "secondary";
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Customer Inquiries</h1>
          <p className="text-muted-foreground">Manage customer inquiries and leads</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingInquiry(null)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Inquiry
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingInquiry ? "Edit" : "Add"} Customer Inquiry</DialogTitle>
              <DialogDescription>
                {editingInquiry ? "Update" : "Create"} customer inquiry details
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input
                    id="full_name"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="occupation">Occupation</Label>
                  <Input
                    id="occupation"
                    value={formData.occupation}
                    onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="office_space_requirement">Office Space Requirement</Label>
                  <Input
                    id="office_space_requirement"
                    value={formData.office_space_requirement}
                    onChange={(e) => setFormData({ ...formData, office_space_requirement: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="office_space_use">Office Space Use</Label>
                  <Input
                    id="office_space_use"
                    value={formData.office_space_use}
                    onChange={(e) => setFormData({ ...formData, office_space_use: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="expected_price_range">Expected Price Range</Label>
                  <Input
                    id="expected_price_range"
                    value={formData.expected_price_range}
                    onChange={(e) => setFormData({ ...formData, expected_price_range: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inquiry">Inquiry</SelectItem>
                      <SelectItem value="site_visit_booked">Site Visit Booked</SelectItem>
                      <SelectItem value="converted">Converted</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editingInquiry ? "Update" : "Add"} Inquiry
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Inquiries</CardTitle>
          <CardDescription>
            Total inquiries: {inquiries.length}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Space Requirement</TableHead>
                <TableHead>Expected Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inquiries.map((inquiry) => (
                <TableRow key={inquiry.id}>
                  <TableCell className="font-medium">{inquiry.full_name}</TableCell>
                  <TableCell>{inquiry.phone}</TableCell>
                  <TableCell>{inquiry.email}</TableCell>
                  <TableCell>{inquiry.office_space_requirement}</TableCell>
                  <TableCell>{inquiry.expected_price_range}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusBadgeVariant(inquiry.status)}>
                      {inquiry.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {new Date(inquiry.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleView(inquiry)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(inquiry)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Customer Inquiry Details</DialogTitle>
          </DialogHeader>
          {viewingInquiry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="font-semibold">Full Name:</Label>
                  <p>{viewingInquiry.full_name}</p>
                </div>
                <div>
                  <Label className="font-semibold">Phone:</Label>
                  <p>{viewingInquiry.phone}</p>
                </div>
                <div>
                  <Label className="font-semibold">Email:</Label>
                  <p>{viewingInquiry.email}</p>
                </div>
                <div>
                  <Label className="font-semibold">Occupation:</Label>
                  <p>{viewingInquiry.occupation}</p>
                </div>
                <div>
                  <Label className="font-semibold">Office Space Requirement:</Label>
                  <p>{viewingInquiry.office_space_requirement}</p>
                </div>
                <div>
                  <Label className="font-semibold">Office Space Use:</Label>
                  <p>{viewingInquiry.office_space_use}</p>
                </div>
                <div>
                  <Label className="font-semibold">Expected Price Range:</Label>
                  <p>{viewingInquiry.expected_price_range}</p>
                </div>
                <div>
                  <Label className="font-semibold">Status:</Label>
                  <Badge variant={getStatusBadgeVariant(viewingInquiry.status)}>
                    {viewingInquiry.status}
                  </Badge>
                </div>
              </div>
              {viewingInquiry.notes && (
                <div>
                  <Label className="font-semibold">Notes:</Label>
                  <p className="mt-1">{viewingInquiry.notes}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>
                  <Label className="font-semibold">Created:</Label>
                  <p>{new Date(viewingInquiry.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <Label className="font-semibold">Updated:</Label>
                  <p>{new Date(viewingInquiry.updated_at).toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerInquiries;