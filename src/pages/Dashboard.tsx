import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const Dashboard = () => {
  // Fetch summary data for dashboard cards
  const { data: sitesCount } = useQuery({
    queryKey: ['sites-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('sites')
        .select('*', { count: 'exact', head: true });
      return count || 0;
    }
  });

  const { data: activitiesCount } = useQuery({
    queryKey: ['activities-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('activities')
        .select('*', { count: 'exact', head: true });
      return count || 0;
    }
  });

  const { data: materialRequestsCount } = useQuery({
    queryKey: ['material-requests-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('material_requests')
        .select('*', { count: 'exact', head: true });
      return count || 0;
    }
  });

  const { data: bookingsCount } = useQuery({
    queryKey: ['bookings-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true });
      return count || 0;
    }
  });

  // Fetch recent activities with images and user info
  const { data: recentActivities } = useQuery({
    queryKey: ['recent-activities'],
    queryFn: async () => {
      const { data } = await supabase
        .from('activities')
        .select(`
          *,
          users:user_id (
            name,
            phone
          )
        `)
        .order('created_at', { ascending: false })
        .limit(5);
      return data || [];
    }
  });

  // Fetch recent material requests with images and user info
  const { data: recentMaterialRequests } = useQuery({
    queryKey: ['recent-material-requests'],
    queryFn: async () => {
      const { data } = await supabase
        .from('material_requests')
        .select(`
          *,
          users:user_id (
            name,
            phone
          )
        `)
        .order('created_at', { ascending: false })
        .limit(5);
      return data || [];
    }
  });

  // Fetch recent bookings
  const { data: recentBookings } = useQuery({
    queryKey: ['recent-bookings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('bookings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      return data || [];
    }
  });

  // Helper function to get the correct image URL
  const getImageUrl = (imageKey: string | null) => {
    if (!imageKey) return null;
    return `https://pub-480de15262b346c8b5ebf5e8141b43f9.r2.dev/${imageKey}`;
  };

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Dashboard Overview</h1>
        
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sites</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{sitesCount}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Activities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activitiesCount}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Material Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{materialRequestsCount}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bookings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{bookingsCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Data Tables */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Recent Activities */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activities</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Image</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Created By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentActivities?.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell>
                        {activity.image_key ? (
                          <div className="w-12 h-12">
                            <img 
                              src={getImageUrl(activity.image_key)} 
                              alt="Activity" 
                              className="w-12 h-12 object-cover rounded-md"
                              onError={(e) => {
                                console.log('Image failed to load:', getImageUrl(activity.image_key));
                                e.currentTarget.style.display = 'none';
                              }}
                              onLoad={() => {
                                console.log('Image loaded successfully:', getImageUrl(activity.image_key));
                              }}
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 bg-gray-200 rounded-md flex items-center justify-center">
                            <span className="text-gray-400 text-xs">No img</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{activity.activity_type || 'N/A'}</TableCell>
                      <TableCell className="truncate max-w-[120px]">{activity.description || 'No description'}</TableCell>
                      <TableCell>{activity.hours || 0}</TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {activity.created_at ? new Date(activity.created_at).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {activity.users?.name || activity.users?.phone || 'Unknown'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Recent Material Requests */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Material Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Image</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Urgency</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Created By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentMaterialRequests?.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        {request.image_key ? (
                          <img 
                            src={getImageUrl(request.image_key)} 
                            alt="Material" 
                            className="w-12 h-12 object-cover rounded-md"
                            onError={(e) => {
                              console.log('Material image failed to load:', getImageUrl(request.image_key));
                              e.currentTarget.style.display = 'none';
                            }}
                            onLoad={() => {
                              console.log('Material image loaded successfully:', getImageUrl(request.image_key));
                            }}
                          />
                        ) : (
                          <div className="w-12 h-12 bg-gray-200 rounded-md flex items-center justify-center">
                            <span className="text-gray-400 text-xs">No img</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{request.material_name || 'N/A'}</TableCell>
                      <TableCell>{request.quantity || 0} {request.unit || ''}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          request.urgency === 'high' ? 'bg-red-100 text-red-800' :
                          request.urgency === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {request.urgency || 'medium'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          request.status === 'approved' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {request.status || 'pending'}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {request.created_at ? new Date(request.created_at).toLocaleDateString() : 'N/A'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {request.users?.name || request.users?.phone || 'Unknown'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Recent Bookings */}
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Recent Bookings</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Slot Time</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentBookings?.map((booking) => (
                    <TableRow key={booking.id}>
                      <TableCell className="font-medium">{booking.customer_name || 'N/A'}</TableCell>
                      <TableCell>{booking.customer_phone || 'N/A'}</TableCell>
                      <TableCell>
                        {booking.slot_time ? new Date(booking.slot_time).toLocaleString() : 'N/A'}
                      </TableCell>
                      <TableCell>{booking.duration_minutes || 0} min</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          booking.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          booking.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {booking.status || 'pending'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
